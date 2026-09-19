package com.example.webcamapp.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.util.Log
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.LinearLayoutManager
import com.example.webcamapp.R
import com.example.webcamapp.camera.CameraManager
import com.example.webcamapp.databinding.ActivityMainBinding
import com.example.webcamapp.databinding.DialogCamerasListBinding
import com.example.webcamapp.databinding.ItemCameraBinding
import com.example.webcamapp.network.CameraInfo
import com.example.webcamapp.network.CameraStatus
import com.example.webcamapp.network.StreamConfig
import com.example.webcamapp.service.StreamingService
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {

    private var binding: ActivityMainBinding? = null
    private val previewView by lazy { binding?.previewView!! }
    private val streamButton by lazy { binding?.streamButton!! }
    private val switchCameraButton by lazy { binding?.switchCameraButton!! }
    private val camerasListButton by lazy { binding?.camerasListButton!! }
    private val settingsFab by lazy { binding?.settingsFab!! }
    private val statusText by lazy { binding?.statusText!! }
    private val statusIcon by lazy { binding?.statusIcon!! }
    private val motionStatusText by lazy { binding?.motionStatusText!! }

    private val cameraManager by lazy {
        CameraManager(
            this,
            StreamConfig(cameraId = "camera_${android.os.Build.SERIAL}"),
            onFrameCallback = { _, _, _ -> },
            onError = { error ->
                runOnUiThread { showError(error) }
            }
        )
    }

    private var isStreaming = false
    private var currentFacing = androidx.camera.core.CameraSelector.LENS_FACING_BACK

    private val requestPermissionsLauncher = registerForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val allGranted = permissions.values.all { it }
        if (allGranted) {
            initializeCamera()
        } else {
            showPermissionDeniedDialog()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding!!.root)

        checkPermissions()
        setupUI()
    }

    private fun checkPermissions() {
        val requiredPermissions = arrayOf(
            Manifest.permission.CAMERA,
            Manifest.permission.RECORD_AUDIO,
            Manifest.permission.INTERNET,
            Manifest.permission.ACCESS_NETWORK_STATE,
            Manifest.permission.WAKE_LOCK,
            Manifest.permission.FOREGROUND_SERVICE,
            Manifest.permission.FOREGROUND_SERVICE_CAMERA,
            Manifest.permission.FOREGROUND_SERVICE_MICROPHONE
        )

        val missingPermissions = requiredPermissions.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }

        if (missingPermissions.isNotEmpty()) {
            requestPermissionsLauncher.launch(missingPermissions.toTypedArray())
        } else {
            initializeCamera()
        }
    }

    private fun initializeCamera() {
        runOnUiThread {
            cameraManager.start(previewView)
            updateStatus("Ready to stream", false)
        }
    }

    private fun setupUI() {
        streamButton.setOnClickListener {
            toggleStreaming()
        }

        switchCameraButton.setOnClickListener {
            switchCamera()
        }

        camerasListButton.setOnClickListener {
            showCamerasList()
        }

        settingsFab.setOnClickListener {
            showSettingsDialog()
        }
    }

    private fun toggleStreaming() {
        if (isStreaming) {
            stopStreaming()
        } else {
            startStreaming()
        }
    }

    private fun startStreaming() {
        val intent = Intent(this, StreamingService::class.java).apply {
            action = "START_STREAM"
            putExtra("cameraId", "camera_${android.os.Build.SERIAL}")
            putExtra("port", 8080)
        }

        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            startForegroundService(intent)
        } else {
            startService(intent)
        }

        isStreaming = true
        updateUIForStreaming(true)
        updateStatus("Streaming on port 8080", false)
    }

    private fun stopStreaming() {
        val intent = Intent(this, StreamingService::class.java).apply {
            action = "STOP_STREAM"
        }
        stopService(intent)

        isStreaming = false
        updateUIForStreaming(false)
        updateStatus("Disconnected", false)
    }

    private fun switchCamera() {
        cameraManager.switchCamera(previewView)
        currentFacing = cameraManager.getCurrentFacing()
        val facingName = if (currentFacing == androidx.camera.core.CameraSelector.LENS_FACING_BACK) "Back" else "Front"
        switchCameraButton.text = "$facingName Camera"
        Toast.makeText(this, "Switched to $facingName camera", Toast.LENGTH_SHORT).show()
    }

    private fun updateUIForStreaming(streaming: Boolean) {
        streamButton.text = if (streaming) getString(R.string.stop_streaming) else getString(R.string.start_streaming)
        streamButton.setBackgroundTintList(
            android.content.res.ColorStateList.valueOf(
                if (streaming) ContextCompat.getColor(this, R.color.red) else ContextCompat.getColor(this, R.color.primary)
            )
        )
    }

    private fun updateStatus(text: String, isConnecting: Boolean) {
        runOnUiThread {
            statusText.text = text
            statusIcon.setTextColor(
                ContextCompat.getColor(this, if (isConnecting) R.color.orange else R.color.gray_dark)
            )
        }
    }

    private fun showCamerasList() {
        val dialogBinding = DialogCamerasListBinding.inflate(layoutInflater)
        val dialog = MaterialAlertDialogBuilder(this)
            .setView(dialogBinding.root)
            .create()

        dialog.show()

        dialogBinding.camerasRecyclerView.layoutManager = LinearLayoutManager(this)
        dialogBinding.camerasRecyclerView.adapter = CamerasAdapter(getMockCameras())

        dialogBinding.closeButton.setOnClickListener { dialog.dismiss() }
    }

    private fun getMockCameras(): List<CameraInfo> {
        return listOf(
            CameraInfo("camera_${android.os.Build.SERIAL}", "Main Camera", CameraStatus.ONLINE, System.currentTimeMillis()),
            CameraInfo("camera_2", "Secondary Camera", CameraStatus.OFFLINE, System.currentTimeMillis() - 3600000)
        )
    }

    private fun showSettingsDialog() {
        MaterialAlertDialogBuilder(this)
            .setTitle(R.string.settings)
            .setItems(arrayOf("Streaming Port", "Video Quality", "Motion Detection", "About")) { _, which ->
                when (which) {
                    0 -> showPortConfigDialog()
                    1 -> showQualityDialog()
                    2 -> showMotionConfigDialog()
                    3 -> showAboutDialog()
                }
            }
            .show()
    }

    private fun showPortConfigDialog() {
        // Implementation for port configuration
    }

    private fun showQualityDialog() {
        // Implementation for video quality settings
    }

    private fun showMotionConfigDialog() {
        // Implementation for motion detection settings
    }

    private fun showAboutDialog() {
        MaterialAlertDialogBuilder(this)
            .setTitle("WebCam Stream")
            .setMessage("Version 1.0\nMJPEG Streaming on port 8080\nMotion detection enabled")
            .setPositiveButton("OK", null)
            .show()
    }

    private fun showError(message: String) {
        runOnUiThread {
            Toast.makeText(this, "Error: $message", Toast.LENGTH_LONG).show()
            Log.e("MainActivity", message)
        }
    }

    private fun showPermissionDeniedDialog() {
        AlertDialog.Builder(this)
            .setTitle("Permissions Required")
            .setMessage("Camera and microphone permissions are required for streaming. Please enable them in settings.")
            .setPositiveButton("Settings") { _, _ ->
                val intent = Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                intent.data = android.net.Uri.parse("package:$packageName")
                startActivity(intent)
            }
            .setNegativeButton("Exit") { _, _ -> finish() }
            .setCancelable(false)
            .show()
    }

    override fun onDestroy() {
        super.onDestroy()
        cameraManager.shutdown()
    }
}

class CamerasAdapter(private val cameras: List<CameraInfo>) :
    androidx.recyclerview.widget.RecyclerView.Adapter<CamerasAdapter.CameraViewHolder>() {

    class CameraViewHolder(private val binding: ItemCameraBinding) : androidx.recyclerview.widget.RecyclerView.ViewHolder(binding.root) {
        fun bind(camera: CameraInfo) {
            binding.cameraName.text = camera.name
            binding.cameraStatus.text = camera.status.name
            binding.statusIndicator.setImageResource(
                if (camera.status == CameraStatus.ONLINE) R.drawable.ic_status_online else R.drawable.ic_status_offline
            )
        }
    }

    override fun onCreateViewHolder(parent: android.view.ViewGroup, viewType: Int): CameraViewHolder {
        val binding = ItemCameraBinding.inflate(android.view.LayoutInflater.from(parent.context), parent, false)
        return CameraViewHolder(binding)
    }

    override fun onBindViewHolder(holder: CameraViewHolder, position: Int) {
        holder.bind(cameras[position])
    }

    override fun getItemCount(): Int = cameras.size
}