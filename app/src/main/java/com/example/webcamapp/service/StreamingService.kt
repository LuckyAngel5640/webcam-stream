package com.example.webcamapp.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.ImageFormat
import android.graphics.YuvImage
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.app.NotificationCompat
import com.example.webcamapp.R
import com.example.webcamapp.camera.CameraManager
import com.example.webcamapp.network.MotionAlert
import com.example.webcamapp.network.StreamConfig
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.io.ByteArrayOutputStream
import java.net.ServerSocket
import java.net.Socket
import java.nio.ByteBuffer
import java.util.concurrent.Executors
import kotlin.math.abs

class StreamingService : Service() {

    private var cameraManager: CameraManager? = null
    private var streamConfig: StreamConfig? = null
    private var isStreaming = false
    private var mjpegServer: MjpegServer? = null
    private var lastFrame: ByteBuffer? = null
    private val frameLock = Any()

    private val notificationId = 1001
    private val channelId = "streaming_channel"

    // Simple motion detection state
    private var previousFrame: ByteArray? = null
    private val motionThreshold = 5000

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action
        when (action) {
            "START_STREAM" -> startStreaming(intent)
            "STOP_STREAM" -> stopStreaming()
        }
        return START_STICKY
    }

    private fun startStreaming(intent: Intent) {
        if (isStreaming) return

        val cameraId = intent.getStringExtra("cameraId") ?: "camera_${android.os.Build.SERIAL}"
        val serverUrl = intent.getStringExtra("serverUrl") ?: "wss://dreamcast.cam/signaling"
        val port = intent.getIntExtra("port", 8080)

        streamConfig = StreamConfig(cameraId = cameraId)

        cameraManager = CameraManager(
            this,
            streamConfig!!,
            onFrameCallback = { data, width, height ->
                processFrame(data, width, height)
            },
            onError = { error ->
                Log.e("StreamingService", "Camera error: $error")
                stopSelf()
            }
        )

        val notification = createNotification("Starting stream...")
        startForeground(notificationId, notification)

        mjpegServer = MjpegServer(port)
        mjpegServer?.start()

        cameraManager?.start(previewView = null)

        isStreaming = true
    }

    private fun processFrame(data: ByteBuffer, width: Int, height: Int) {
        val copy = ByteBuffer.allocateDirect(data.remaining())
        copy.put(data)
        copy.rewind()

        // Update MJPEG server
        mjpegServer?.setFrame(copy, width, height)

        // Simple motion detection using frame differencing
        detectMotion(copy, width, height)
    }

    private fun detectMotion(currentFrame: ByteBuffer, width: Int, height: Int) {
        val currentBytes = ByteArray(currentFrame.remaining())
        currentFrame.rewind()
        currentFrame.get(currentBytes)

        if (previousFrame != null) {
            var diff = 0
            for (i in 0 until currentBytes.size) {
                val diffVal = abs(currentBytes[i].toInt() - previousFrame!![i].toInt())
                if (diffVal > 30) diff++
            }

            if (diff > motionThreshold) {
                // Motion detected - capture frame as JPEG
                val yuvImage = YuvImage(
                    currentBytes,
                    ImageFormat.NV21,
                    width,
                    height,
                    null
                )
                val baos = ByteArrayOutputStream()
                yuvImage.compressToJpeg(android.graphics.Rect(0, 0, width, height), 70, baos)
                val jpegBytes = baos.toByteArray()
                val base64Image = android.util.Base64.encodeToString(jpegBytes, android.util.Base64.NO_WRAP)

                val alert = MotionAlert(
                    id = "${streamConfig?.cameraId}_${System.currentTimeMillis()}",
                    cameraId = streamConfig?.cameraId ?: "",
                    timestamp = System.currentTimeMillis(),
                    imageBase64 = base64Image
                )

                // Send motion alert (in a real app, send to signaling server)
                Log.d("StreamingService", "Motion detected: ${alert.id}")
            }
        }
        previousFrame = currentBytes
    }

    private fun stopStreaming() {
        isStreaming = false
        cameraManager?.stop()
        mjpegServer?.stop()
        mjpegServer = null
        cameraManager = null
        stopForeground(true)
        stopSelf()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                "Camera Streaming",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Active camera streaming session"
            }
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }

    private fun createNotification(text: String): Notification {
        val intent = Intent(this, com.example.webcamapp.ui.MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent, PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, channelId)
            .setContentTitle("WebCam Stream")
            .setContentText(text)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build()
    }

    override fun onDestroy() {
        super.onDestroy()
        stopStreaming()
        cameraManager?.shutdown()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    // Simple MJPEG HTTP Server
    private class MjpegServer(private val port: Int) {
        private var serverSocket: ServerSocket? = null
        private var running = false
        private var acceptThread: Thread? = null
        private var currentFrame: ByteArray? = null
        private var frameWidth = 640
        private var frameHeight = 480
        private val frameLock = Any()

        fun start() {
            try {
                serverSocket = ServerSocket(port)
            } catch (e: java.io.IOException) {
                Log.e("MjpegServer", "Failed to start server on port $port", e)
                return
            }
            running = true
            acceptThread = Thread({ acceptLoop() }, "mjpeg-accept").apply { isDaemon = true; start() }
        }

        fun setFrame(frame: ByteBuffer, width: Int, height: Int) {
            val bytes = ByteArray(frame.remaining())
            frame.rewind()
            frame.get(bytes)
            synchronized(frameLock) {
                currentFrame = bytes
                frameWidth = width
                frameHeight = height
            }
        }

        fun stop() {
            running = false
            try {
                serverSocket?.close()
            } catch (e: java.io.IOException) {
                Log.e("MjpegServer", "Error closing server", e)
            }
        }

        private fun acceptLoop() {
            while (running) {
                try {
                    val socket = serverSocket?.accept() ?: break
                    Thread({ handleClient(socket) }, "mjpeg-client").apply { isDaemon = true; start() }
                } catch (e: java.io.IOException) {
                    if (!running) break
                }
            }
        }

        private fun handleClient(socket: Socket) {
            try {
                socket.setSoTimeout(5000)
                val input = socket.getInputStream()
                val output = socket.getOutputStream()

                // Read request
                val request = StringBuilder()
                var c = input.read()
                while (c != -1 && c != 10) {
                    if (c != 13) request.append(c.toChar())
                    c = input.read()
                }

                val requestLine = request.toString().trim()
                if (requestLine.startsWith("GET")) {
                    val parts = requestLine.split(" ")
                    if (parts.size > 1) {
                        val path = parts[1]
                        if (path == "/" || path == "/index.html") {
                            serveIndex(output)
                        } else if (path == "/videofeed" || path == "/stream") {
                            serveStream(output)
                        } else if (path == "/snapshot.jpg") {
                            serveSnapshot(output)
                        } else {
                            serve404(output)
                        }
                    }
                }
            } catch (e: Exception) {
                Log.e("MjpegServer", "Client error", e)
            } finally {
                try { socket.close() } catch (e: Exception) {}
            }
        }

        private fun serveIndex(out: java.io.OutputStream) {
            val html = """
                <html><head><title>WebCam Stream</title></head>
                <body style='background:#000;margin:0'>
                <img src='/stream' style='width:100%'>
                </body></html>
            """.trimIndent()
            val bytes = html.toByteArray()
            val header = "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: ${bytes.size}\r\n\r\n"
            out.write(header.toByteArray())
            out.write(bytes)
            out.flush()
        }

        private fun serveStream(out: java.io.OutputStream) {
            val header = "HTTP/1.0 200 OK\r\nContent-Type: multipart/x-mixed-replace;boundary=frame\r\nCache-Control: no-cache\r\n\r\n"
            out.write(header.toByteArray())
            out.flush()

            try {
                while (running) {
                    val frame = synchronized(frameLock) { currentFrame?.copyOf() }
                    if (frame != null) {
                        val boundary = "--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.size}\r\n\r\n"
                        out.write(boundary.toByteArray())
                        out.write(frame)
                        out.write("\r\n".toByteArray())
                        out.flush()
                    }
                    Thread.sleep(100)
                }
            } catch (e: InterruptedException) {
                // Exit loop
            }
        }

        private fun serveSnapshot(out: java.io.OutputStream) {
            val frame = synchronized(frameLock) { currentFrame?.copyOf() }
            if (frame != null) {
                val header = "HTTP/1.1 200 OK\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.size}\r\n\r\n"
                out.write(header.toByteArray())
                out.write(frame)
            } else {
                val notFound = "HTTP/1.1 404 Not Found\r\n\r\nNo frame"
                out.write(notFound.toByteArray())
            }
            out.flush()
        }

        private fun serve404(out: java.io.OutputStream) {
            val notFound = "HTTP/1.1 404 Not Found\r\n\r\nNot Found"
            out.write(notFound.toByteArray())
            out.flush()
        }
    }
}