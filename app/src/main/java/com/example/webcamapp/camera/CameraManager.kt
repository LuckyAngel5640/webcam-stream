package com.example.webcamapp.camera

import android.content.Context
import android.hardware.camera2.*
import android.media.Image
import android.media.ImageReader
import android.util.Log
import android.util.Size
import android.view.Surface
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import com.example.webcamapp.network.StreamConfig
import com.google.common.util.concurrent.ListenableFuture
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.nio.ByteBuffer
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class CameraManager(
    private val context: Context,
    private val config: StreamConfig,
    private val onFrameCallback: (ByteBuffer, Int, Int) -> Unit,
    private val onError: (String) -> Unit
) {
    private var cameraProvider: ProcessCameraProvider? = null
    private var camera: androidx.camera.core.Camera? = null
    private var imageAnalysis: ImageAnalysis? = null
    private var preview: Preview? = null
    private val cameraExecutor: ExecutorService = Executors.newSingleThreadExecutor()
    private val analysisExecutor: ExecutorService = Executors.newSingleThreadExecutor()
    private var isStarted = false
    private var currentFacing = CameraSelector.LENS_FACING_BACK

    fun start(previewView: PreviewView? = null): Boolean {
        if (isStarted) return true

        val cameraProviderFuture: ListenableFuture<ProcessCameraProvider> =
            ProcessCameraProvider.getInstance(context)

        cameraProviderFuture.addListener({
            try {
                cameraProvider = cameraProviderFuture.get()
                bindCamera(previewView)
                isStarted = true
            } catch (e: Exception) {
                onError("Failed to start camera: ${e.message}")
                Log.e("CameraManager", "Camera start failed", e)
            }
        }, cameraExecutor)

        return true
    }

    private fun bindCamera(previewView: PreviewView?) {
        cameraProvider?.let { provider ->
            // Preview (only if previewView provided)
            if (previewView != null) {
                preview = Preview.Builder()
                    .setTargetResolution(Size(config.videoWidth, config.videoHeight))
                    .build()
                    .also { it.setSurfaceProvider(previewView.surfaceProvider) }
            }

            // Image Analysis for frame capture
            imageAnalysis = ImageAnalysis.Builder()
                .setTargetResolution(Size(config.videoWidth, config.videoHeight))
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build()
                .also {
                    it.setAnalyzer(analysisExecutor, { imageProxy ->
                        processFrame(imageProxy)
                    })
                }

            // Camera Selector
            val cameraSelector = CameraSelector.Builder()
                .requireLensFacing(currentFacing)
                .build()

            // Bind to lifecycle
            try {
                val useCases = if (preview != null) {
                    listOf(preview!!, imageAnalysis!!)
                } else {
                    listOf(imageAnalysis!!)
                }
                camera = provider.bindToLifecycle(
                    context as androidx.lifecycle.LifecycleOwner,
                    cameraSelector,
                    *useCases.toTypedArray()
                )
            } catch (e: Exception) {
                onError("Failed to bind camera: ${e.message}")
                Log.e("CameraManager", "Bind failed", e)
            }
        }
    }

    private fun processFrame(imageProxy: ImageProxy) {
        val image = imageProxy.image ?: return
        val planes = image.planes
        if (planes.size < 1) {
            imageProxy.close()
            return
        }

        val buffer = planes[0].buffer
        val width = image.width
        val height = image.height

        // Create a copy of the buffer data
        val copy = ByteBuffer.allocateDirect(buffer.remaining())
        copy.put(buffer)
        copy.rewind()

        onFrameCallback(copy, width, height)
        imageProxy.close()
    }

    fun switchCamera(previewView: PreviewView? = null) {
        currentFacing = if (currentFacing == CameraSelector.LENS_FACING_BACK) {
            CameraSelector.LENS_FACING_FRONT
        } else {
            CameraSelector.LENS_FACING_BACK
        }
        stop()
        start(previewView)
    }

    fun getCurrentFacing(): Int = currentFacing

    fun stop() {
        isStarted = false
        cameraProvider?.unbindAll()
        camera = null
        preview = null
        imageAnalysis = null
    }

    fun shutdown() {
        stop()
        cameraExecutor.shutdown()
        analysisExecutor.shutdown()
    }
}