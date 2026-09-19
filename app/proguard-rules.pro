# ProGuard rules for WebCamApp
-keep class org.webrtc.** { *; }
-keep class com.google.mlkit.** { *; }
-keep class androidx.camera.** { *; }
-keep class com.example.webcamapp.** { *; }

# Keep names for reflection
-keepnames class * implements android.os.Parcelable
-keepclassmembers class * implements android.os.Parcelable {
    public static final android.os.Parcelable$Creator CREATOR;
}

# Keep native methods
-keepclasseswithmembernames class * {
    native <methods>;
}

# Keep enum values
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# Keep annotations
-keepattributes *Annotation*

# WebRTC specific
-dontwarn org.webrtc.**
-dontwarn org.chromium.**

# ML Kit
-dontwarn com.google.mlkit.**

# OkHttp
-dontwarn okhttp3.**
-dontwarn okio.**

# Gson
-dontwarn com.google.gson.**
-keep class com.google.gson.** { *; }