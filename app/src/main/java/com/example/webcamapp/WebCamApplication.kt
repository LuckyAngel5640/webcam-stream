package com.example.webcamapp

import android.app.Application
import android.os.Build
import android.util.Log

class WebCamApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        if (BuildConfig.DEBUG) {
            Log.d("WebCamApp", "Application started")
        }
    }
}