package com.example.webcamapp.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.os.Build
import android.os.IBinder
import android.util.Log
import android.util.Size
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.app.NotificationCompat
import com.example.webcamapp.R
import com.example.webcamapp.camera.CameraManager
import com.example.webcamapp.network.StreamConfig
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.webrtc.AudioSource
import org.webrtc.AudioTrack
import org.webrtc.Camera1Enumerator
import org.webrtc.Camera2Enumerator
import org.webrtc.CameraEnumerator
import org.webrtc.CameraVideoCapturer
import org.webrtc.DataChannel
import org.webrtc.DefaultVideoDecoderFactory
import org.webrtc.DefaultVideoEncoderFactory
import org.webrtc.EglBase
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.MediaStream
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.RtpParameters
import org.webrtc.RtpTransceiver
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription
import org.webrtc.SurfaceTextureHelper
import org.webrtc.VideoCapturer
import org.webrtc.VideoEncoderFactory
import org.webrtc.VideoFrame
import org.webrtc.VideoSink
import org.webrtc.VideoSource
import org.webrtc.VideoTrack
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import com.google.gson.Gson
import java.nio.ByteBuffer
import java.util.concurrent.Executors

class StreamingService : Service() {

    private var cameraManager: CameraManager? = null
    private var streamConfig: StreamConfig? = null
    private var isStreaming = false

    private val notificationId = 1001
    private val channelId = "streaming_channel"

    // WebRTC
    private var peerConnectionFactory: PeerConnectionFactory? = null
    private var peerConnection: PeerConnection? = null
    private var videoTrack: VideoTrack? = null
    private var videoSource: VideoSource? = null
    private var videoCapturer: VideoCapturer? = null
    private var eglBase: EglBase? = null
    private var surfaceTextureHelper: SurfaceTextureHelper? = null
    private var webSocket: WebSocket? = null
    private var cameraId: String = ""
    private var serverUrl: String = "wss://ubuntu-production-8e92.up.railway.app/signaling"

    private val notificationId = 1001
    private val channelId = "streaming_channel"

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        initWebRTC()
    }

    private fun initWebRTC() {
        PeerConnectionFactory.initialize(
            PeerConnectionFactory.InitializationOptions.builder(this)
                .setEnableInternalTracer(true)
                .createInitializationOptions()
        )

        val encoderFactory = DefaultVideoEncoderFactory(
            EglBase.create().eglBaseContext,
            true,
            true
        )
        val decoderFactory = DefaultVideoDecoderFactory(EglBase.create().eglBaseContext)

        peerConnectionFactory = PeerConnectionFactory.builder()
            .setVideoEncoderFactory(encoderFactory)
            .setVideoDecoderFactory(decoderFactory)
            .createPeerConnectionFactory()

        eglBase = EglBase.create()
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

        cameraId = intent.getStringExtra("cameraId") ?: "camera_${android.os.Build.SERIAL}"
        serverUrl = intent.getStringExtra("serverUrl") ?: "wss://ubuntu-production-8e92.up.railway.app/signaling"

        streamConfig = StreamConfig(cameraId = cameraId)

        val notification = createNotification("Connecting to server...")
        startForeground(notificationId, notification)

        // Start camera
        cameraManager = CameraManager(
            this,
            streamConfig!!,
            onFrameCallback = { data, width, height ->
                onCameraFrame(data, width, height)
            },
            onError = { error ->
                Log.e("StreamingService", "Camera error: $error")
                stopSelf()
            }
        )

        cameraManager?.start(previewView = null)

        // Connect to signaling server
        connectToSignalingServer()

        isStreaming = true
    }

    private fun connectToSignalingServer() {
        val client = OkHttpClient.Builder().build()
        val request = Request.Builder().url(serverUrl).build()

        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                Log.d("StreamingService", "WebSocket connected")
                runOnUiThread { updateNotification("Connected, registering...") }
                
                // Register camera
                val registerMsg = SignalingMessage(
                    type = "register",
                    cameraId = cameraId
                )
                webSocket.send(registerMsg.toJson())

                // Create peer connection and offer
                createPeerConnection()
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                handleSignalingMessage(text)
            }

            override fun onMessage(webSocket: WebSocket, bytes: ByteString) {}

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                webSocket.close(1000, null)
                runOnUiThread { updateNotification("Disconnected") }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                Log.e("StreamingService", "WebSocket error", t)
                runOnUiThread { updateNotification("Connection failed: ${t.message}") }
            }
        })
    }

    private fun createPeerConnection() {
        val iceServers = listOf(
            PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer()
        )

        val constraints = MediaConstraints().apply {
            mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveAudio", "false"))
            mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveVideo", "true"))
        }

        peerConnection = peerConnectionFactory?.createPeerConnection(
            iceServers,
            constraints,
            object : PeerConnection.Observer() {
                override fun onIceCandidate(candidate: IceCandidate) {
                    val msg = SignalingMessage(
                        type = "candidate",
                        cameraId = cameraId,
                        candidate = candidate.sdp,
                        sdpMid = candidate.sdpMid,
                        sdpMLineIndex = candidate.sdpMLineIndex
                    )
                    webSocket?.send(msg.toJson())
                }

                override fun onSignalingChangeState(state: PeerConnection.SignalingState) {}
                override fun onIceConnectionChange(state: PeerConnection.IceConnectionState) {
                    Log.d("StreamingService", "ICE state: $state")
                    if (state == PeerConnection.IceConnectionState.CONNECTED) {
                        runOnUiThread { updateNotification("Streaming live!") }
                    }
                }
                override fun onIceConnectionReceivingChange(receiving: Boolean) {}
                override fun onAddStream(stream: MediaStream) {}
                override fun onRemoveStream(stream: MediaStream) {}
                override fun onDataChannel(dataChannel: DataChannel) {}
                override fun onRenegotiationNeeded() {}
                override fun onAddTrack(receiver: RtpReceiver, streams: Array<MediaStream>) {}
            }
        )

        // Create video track
        videoSource = peerConnectionFactory?.createVideoSource(false)
        videoTrack = peerConnectionFactory?.createVideoTrack("camera_video", videoSource!!)
        
        val localStream = peerConnectionFactory?.createLocalMediaStream("camera_stream")
        localStream?.addTrack(videoTrack!!)
        
        peerConnection?.addTrack(videoTrack!!, listOf("camera_stream"))

        // Start camera capturer
        startCameraCapturer()

        // Create offer
        peerConnection?.createOffer(
            object : SdpObserver {
                override fun onCreateSuccess(sessionDescription: SessionDescription) {
                    peerConnection?.setLocalDescription(this, sessionDescription)
                    val msg = SignalingMessage(
                        type = "offer",
                        cameraId = cameraId,
                        sdp = sessionDescription.description
                    )
                    webSocket?.send(msg.toJson())
                }
                override fun onCreateFailure(error: String) {
                    Log.e("StreamingService", "Create offer failed: $error")
                }
                override fun onSetSuccess() {}
                override fun onSetFailure(error: String) {
                    Log.e("StreamingService", "Set local description failed: $error")
                }
            },
            MediaConstraints()
        )
    }

    private fun startCameraCapturer() {
        val cameraEnumerator: CameraEnumerator = if (Camera2Enumerator.isSupported(this)) {
            Camera2Enumerator(this)
        } else {
            Camera1Enumerator(false)
        }

        val deviceNames = cameraEnumerator.getDeviceNames()
        var selectedDevice: String? = null
        
        for (name in deviceNames) {
            if (cameraEnumerator.isFrontFacing(name)) {
                selectedDevice = name
                break
            }
        }
        selectedDevice = selectedDevice ?: deviceNames.firstOrNull()

        selectedDevice?.let {
            videoCapturer = cameraEnumerator.createCapturer(it, null)
            val capturer = videoCapturer as? CameraVideoCapturer
            capturer?.switchCamera(null)
            
            surfaceTextureHelper = SurfaceTextureHelper.create("capture_thread", eglBase!!.eglBaseContext)
            videoCapturer?.initialize(surfaceTextureHelper!!, this, videoSource!!)
            videoCapturer?.startCapture(1280, 720, 30)
        }
    }

    private fun handleSignalingMessage(text: String) {
        val msg = SignalingMessage.fromJson(text)
        when (msg.type) {
            "answer" -> {
                msg.sdp?.let { sdp ->
                    val sessionDescription = SessionDescription(SessionDescription.Type.ANSWER, sdp)
                    peerConnection?.setRemoteDescription(
                        object : SdpObserver {
                            override fun onCreateSuccess(sessionDescription: SessionDescription) {}
                            override fun onCreateFailure(error: String) {}
                            override fun onSetSuccess() { Log.d("StreamingService", "Remote description set") }
                            override fun onSetFailure(error: String) { Log.e("StreamingService", "Set remote failed: $error") }
                        },
                        sessionDescription
                    )
                }
            }
            "candidate" -> {
                msg.candidate?.let { candidate ->
                    val iceCandidate = IceCandidate(msg.sdpMid!!, msg.sdpMLineIndex!!, candidate)
                    peerConnection?.addIceCandidate(iceCandidate)
                }
            }
            "viewer_joined" -> {
                Log.d("StreamingService", "Viewer joined: ${msg.cameraId}")
            }
        }
    }

    private fun onCameraFrame(data: ByteBuffer, width: Int, height: Int) {
        // Frame is handled by CameraManager -> CameraX -> WebRTC capturer
        // The WebRTC capturer gets frames directly from CameraX
    }

    private fun stopStreaming() {
        isStreaming = false
        webSocket?.close(1000, "Client stopping")
        webSocket = null
        videoCapturer?.stopCapture()
        videoCapturer?.dispose()
        videoCapturer = null
        surfaceTextureHelper?.dispose()
        surfaceTextureHelper = null
        peerConnection?.close()
        peerConnection = null
        videoTrack?.dispose()
        videoTrack = null
        videoSource?.dispose()
        videoSource = null
        cameraManager?.stop()
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

    private fun updateNotification(text: String) {
        val notification = createNotification(text)
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(notificationId, notification)
    }

    private fun runOnUiThread(action: () -> Unit) {
        val handler = android.os.Handler(android.os.Looper.getMainLooper())
        handler.post(action)
    }

    override fun onDestroy() {
        super.onDestroy()
        stopStreaming()
        cameraManager?.shutdown()
        eglBase?.release()
        peerConnectionFactory?.dispose()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}