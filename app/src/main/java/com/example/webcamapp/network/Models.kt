package com.example.webcamapp.network

data class CameraInfo(
    val id: String,
    val name: String,
    val status: CameraStatus = CameraStatus.OFFLINE,
    val lastSeen: Long = System.currentTimeMillis(),
    val facing: Int = 0,
    val resolution: String = "1280x720"
)

enum class CameraStatus {
    ONLINE, OFFLINE, CONNECTING, ERROR
}

data class MotionAlert(
    val id: String,
    val cameraId: String,
    val timestamp: Long,
    val imageBase64: String? = null,
    val imageUrl: String? = null
)

data class SignalingConfig(
    val serverUrl: String = "wss://ubuntu-production-8e92.up.railway.app/signaling",
    val stunServers: List<String> = listOf("stun:stun.l.google.com:19302"),
    val turnServers: List<TurnServer> = emptyList()
)

data class TurnServer(
    val urls: List<String>,
    val username: String,
    val credential: String
)

data class StreamConfig(
    val cameraId: String,
    val videoEnabled: Boolean = true,
    val audioEnabled: Boolean = true,
    val videoWidth: Int = 1280,
    val videoHeight: Int = 720,
    val videoFps: Int = 30,
    val videoBitrate: Int = 2500000,
    val audioBitrate: Int = 64000
)

data class SignalingMessage(
    val type: String,
    val sdp: String? = null,
    val candidate: String? = null,
    val sdpMid: String? = null,
    val sdpMLineIndex: Int? = null,
    val cameraId: String? = null,
    val motionAlert: MotionAlert? = null
) {
    fun toJson(): String {
        return com.google.gson.Gson().toJson(this)
    }

    companion object {
        fun fromJson(json: String): SignalingMessage {
            return com.google.gson.Gson().fromJson(json, SignalingMessage::class.java)
        }
    }
}