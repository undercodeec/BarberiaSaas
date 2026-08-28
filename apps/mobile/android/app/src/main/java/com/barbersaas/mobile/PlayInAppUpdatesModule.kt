package com.barbersaas.mobile

import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.google.android.play.core.appupdate.AppUpdateInfo
import com.google.android.play.core.appupdate.AppUpdateManager
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.appupdate.AppUpdateOptions
import com.google.android.play.core.install.InstallState
import com.google.android.play.core.install.InstallStateUpdatedListener
import com.google.android.play.core.install.model.AppUpdateType
import com.google.android.play.core.install.model.InstallStatus
import com.google.android.play.core.install.model.UpdateAvailability

class PlayInAppUpdatesModule(
  private val context: ReactApplicationContext,
) : ReactContextBaseJavaModule(context), LifecycleEventListener {
  private val appUpdateManager: AppUpdateManager? = try {
    AppUpdateManagerFactory.create(context)
  } catch (error: Exception) {
    logDiagnostic("manager initialization", error)
    null
  }

  private val flexibleOptions = AppUpdateOptions.newBuilder(AppUpdateType.FLEXIBLE).build()
  private val pendingCheckPromises = mutableListOf<Promise>()
  private var checkInProgress = false
  private var invalidated = false
  private var lastCheckAt = 0L
  private var lastSnapshot = UpdateSnapshot.unavailable()
  private var updateFlowInProgress = false
  private var updateFlowRequestedThisSession = false

  private val installStateUpdatedListener = InstallStateUpdatedListener { state ->
    context.runOnUiQueueThread {
      if (!invalidated) handleInstallState(state)
    }
  }

  init {
    context.addLifecycleEventListener(this)
    appUpdateManager?.registerListener(installStateUpdatedListener)
  }

  override fun getName(): String = MODULE_NAME

  @ReactMethod
  fun checkForUpdate(promise: Promise) {
    context.runOnUiQueueThread {
      requestCheckIfNeeded(promise)
    }
  }

  @ReactMethod
  fun completeUpdate(promise: Promise) {
    context.runOnUiQueueThread {
      val manager = appUpdateManager
      if (manager == null) {
        promise.resolve(null)
        return@runOnUiQueueThread
      }

      manager.completeUpdate()
        .addOnSuccessListener { promise.resolve(null) }
        .addOnFailureListener { error ->
          logDiagnostic("complete update", error)
          promise.reject(COMPLETE_UPDATE_ERROR, "Google Play no pudo completar la actualización.")
        }
    }
  }

  override fun onHostResume() {
    context.runOnUiQueueThread {
      requestCheckIfNeeded(null)
    }
  }

  override fun onHostPause() = Unit

  override fun onHostDestroy() = Unit

  override fun invalidate() {
    invalidated = true
    appUpdateManager?.unregisterListener(installStateUpdatedListener)
    context.removeLifecycleEventListener(this)
    pendingCheckPromises.forEach { it.resolve(lastSnapshot.toWritableMap()) }
    pendingCheckPromises.clear()
    super.invalidate()
  }

  private fun requestCheckIfNeeded(promise: Promise?) {
    if (invalidated) {
      promise?.resolve(lastSnapshot.toWritableMap())
      return
    }
    val now = System.currentTimeMillis()
    if (checkInProgress) {
      promise?.let(pendingCheckPromises::add)
      return
    }
    if (now - lastCheckAt < CHECK_DEBOUNCE_MS) {
      promise?.resolve(lastSnapshot.toWritableMap())
      return
    }

    val manager = appUpdateManager
    if (manager == null) {
      promise?.resolve(lastSnapshot.toWritableMap())
      return
    }

    lastCheckAt = now
    checkInProgress = true
    promise?.let(pendingCheckPromises::add)
    manager.appUpdateInfo
      .addOnSuccessListener { info ->
        if (invalidated) return@addOnSuccessListener
        applyAppUpdateInfo(info)
        finishCheckPromises()
      }
      .addOnFailureListener { error ->
        if (invalidated) return@addOnFailureListener
        logDiagnostic("availability check", error)
        checkInProgress = false
        finishCheckPromises()
      }
  }

  private fun applyAppUpdateInfo(info: AppUpdateInfo) {
    val flexibleAllowed = info.isUpdateTypeAllowed(flexibleOptions)
    lastSnapshot = UpdateSnapshot.fromAppUpdateInfo(
      info = info,
      flexibleAllowed = flexibleAllowed,
      flowInProgress = updateFlowInProgress,
    )
    emitSnapshot()

    val updateAvailable =
      info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE
    if (
      updateAvailable &&
        flexibleAllowed &&
        !updateFlowInProgress &&
        !updateFlowRequestedThisSession
    ) {
      startFlexibleUpdate(info, appUpdateManager ?: return)
    }
  }

  private fun startFlexibleUpdate(info: AppUpdateInfo, manager: AppUpdateManager) {
    val activity = context.currentActivity
    if (activity == null || activity.isFinishing || activity.isDestroyed) {
      logDiagnostic("start update", null)
      return
    }

    updateFlowInProgress = true
    lastSnapshot = lastSnapshot.copy(flowInProgress = true)
    emitSnapshot()
    try {
      manager.startUpdateFlow(info, activity, flexibleOptions)
        .also { updateFlowRequestedThisSession = true }
        .addOnCompleteListener { task ->
          if (invalidated) return@addOnCompleteListener
          updateFlowInProgress = false
          lastSnapshot = lastSnapshot.copy(flowInProgress = false)
          emitSnapshot()
          if (!task.isSuccessful) {
            logDiagnostic("update flow", task.exception)
          }
        }
    } catch (error: Exception) {
      updateFlowInProgress = false
      lastSnapshot = lastSnapshot.copy(flowInProgress = false)
      emitSnapshot()
      logDiagnostic("start update", error)
    }
  }

  private fun handleInstallState(state: InstallState) {
    lastSnapshot = lastSnapshot.copy(
      bytesDownloaded = state.bytesDownloaded(),
      installStatus = UpdateSnapshot.installStatusName(state.installStatus()),
      totalBytesToDownload = state.totalBytesToDownload(),
    )
    emitSnapshot()
  }

  private fun finishCheckPromises() {
    checkInProgress = false
    pendingCheckPromises.forEach { it.resolve(lastSnapshot.toWritableMap()) }
    pendingCheckPromises.clear()
  }

  private fun emitSnapshot() {
    if (!context.hasActiveReactInstance()) return
    context.emitDeviceEvent(EVENT_NAME, lastSnapshot.toWritableMap())
  }

  private fun logDiagnostic(operation: String, error: Exception?) {
    val suffix = error?.javaClass?.simpleName?.let { " ($it)" } ?: ""
    Log.w(TAG, "Play In-App Updates $operation failed$suffix")
  }

  private data class UpdateSnapshot(
    val availability: String,
    val availableVersionCode: Int?,
    val clientVersionStalenessDays: Int?,
    val flexibleAllowed: Boolean,
    val flowInProgress: Boolean,
    val installStatus: String,
    val priority: Int?,
    val bytesDownloaded: Long,
    val totalBytesToDownload: Long,
  ) {
    fun toWritableMap(): WritableMap = Arguments.createMap().apply {
      putString("availability", availability)
      putString("installStatus", installStatus)
      putBoolean("flexibleAllowed", flexibleAllowed)
      putBoolean("flowInProgress", flowInProgress)
      putLong("bytesDownloaded", bytesDownloaded)
      putLong("totalBytesToDownload", totalBytesToDownload)
      if (availableVersionCode == null) putNull("availableVersionCode")
      else putInt("availableVersionCode", availableVersionCode)
      if (clientVersionStalenessDays == null) putNull("clientVersionStalenessDays")
      else putInt("clientVersionStalenessDays", clientVersionStalenessDays)
      if (priority == null) putNull("updatePriority")
      else putInt("updatePriority", priority)
    }

    companion object {
      fun unavailable() = UpdateSnapshot(
        availability = "UNKNOWN",
        availableVersionCode = null,
        clientVersionStalenessDays = null,
        flexibleAllowed = false,
        flowInProgress = false,
        installStatus = "UNKNOWN",
        priority = null,
        bytesDownloaded = 0L,
        totalBytesToDownload = 0L,
      )

      fun fromAppUpdateInfo(
        info: AppUpdateInfo,
        flexibleAllowed: Boolean,
        flowInProgress: Boolean,
      ): UpdateSnapshot {
        val availability = info.updateAvailability()
        val updateInProgress =
          availability == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS
        val installStatus = if (updateInProgress) info.installStatus() else InstallStatus.UNKNOWN
        val downloading = installStatus == InstallStatus.DOWNLOADING

        return UpdateSnapshot(
          availability = availabilityName(availability),
          availableVersionCode = info.availableVersionCode().takeIf {
            availability == UpdateAvailability.UPDATE_AVAILABLE || updateInProgress
          },
          clientVersionStalenessDays = info.clientVersionStalenessDays(),
          flexibleAllowed = flexibleAllowed,
          flowInProgress = flowInProgress,
          installStatus = installStatusName(installStatus),
          priority = if (availability == UpdateAvailability.UPDATE_AVAILABLE) {
            info.updatePriority()
          } else {
            null
          },
          bytesDownloaded = if (downloading) info.bytesDownloaded() else 0L,
          totalBytesToDownload = if (downloading) info.totalBytesToDownload() else 0L,
        )
      }

      private fun availabilityName(availability: Int): String = when (availability) {
        UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS ->
          "DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS"
        UpdateAvailability.UPDATE_AVAILABLE -> "UPDATE_AVAILABLE"
        UpdateAvailability.UPDATE_NOT_AVAILABLE -> "UPDATE_NOT_AVAILABLE"
        else -> "UNKNOWN"
      }

      fun installStatusName(status: Int): String = when (status) {
        InstallStatus.CANCELED -> "CANCELED"
        InstallStatus.DOWNLOADED -> "DOWNLOADED"
        InstallStatus.DOWNLOADING -> "DOWNLOADING"
        InstallStatus.FAILED -> "FAILED"
        InstallStatus.INSTALLED -> "INSTALLED"
        InstallStatus.INSTALLING -> "INSTALLING"
        InstallStatus.PENDING -> "PENDING"
        else -> "UNKNOWN"
      }
    }
  }

  companion object {
    const val EVENT_NAME = "navaPlayInAppUpdates"
    private const val MODULE_NAME = "NavaPlayInAppUpdates"
    private const val TAG = "NavaPlayInAppUpdates"
    private const val COMPLETE_UPDATE_ERROR = "PLAY_UPDATE_COMPLETE_FAILED"
    private const val CHECK_DEBOUNCE_MS = 5_000L
  }
}
