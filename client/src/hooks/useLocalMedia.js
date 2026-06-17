import { useState, useEffect, useCallback, useRef } from 'react'

/**
 * useLocalMedia()
 *
 * Handles direct browser getUserMedia access — device enumeration,
 * permission requests, camera stream, mic stream.
 * Works independently of LiveKit — gives you a local camera preview
 * even before LiveKit keys are configured.
 */
export function useLocalMedia() {
  const [devices,       setDevices]       = useState({ cameras: [], mics: [] })
  const [selectedCam,   setSelectedCam]   = useState('')   // deviceId
  const [selectedMic,   setSelectedMic]   = useState('')   // deviceId
  const [hasPermission, setHasPermission] = useState(null) // null | true | false
  const [camStream,     setCamStream]     = useState(null) // MediaStream for camera
  const [micStream,     setMicStream]     = useState(null) // MediaStream for mic
  const [micActive,     setMicActive]     = useState(false)
  const micStreamRef = useRef(null)
  const camStreamRef = useRef(null)

  /* ── enumerate devices ──────────────────────────────────────── */
  const refreshDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices()
      const cameras  = all.filter(d => d.kind === 'videoinput')
      const mics     = all.filter(d => d.kind === 'audioinput')
      setDevices({ cameras, mics })
      // auto-select first if nothing selected yet
      setSelectedCam(prev => prev || cameras[0]?.deviceId || '')
      setSelectedMic(prev => prev || mics[0]?.deviceId    || '')
    } catch {}
  }, [])

  useEffect(() => {
    refreshDevices()
    navigator.mediaDevices?.addEventListener('devicechange', refreshDevices)
    return () => navigator.mediaDevices?.removeEventListener('devicechange', refreshDevices)
  }, [refreshDevices])

  /* ── request browser permissions ───────────────────────────── */
  const requestPermissions = useCallback(async () => {
    try {
      // ask for both to get labelled device names
      const tmp = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      tmp.getTracks().forEach(t => t.stop())
      setHasPermission(true)
      await refreshDevices()
      return true
    } catch (e) {
      setHasPermission(false)
      return false
    }
  }, [refreshDevices])

  /* ── camera ─────────────────────────────────────────────────── */
  const enableCamera = useCallback(async (deviceId) => {
    // stop any existing camera stream first
    camStreamRef.current?.getTracks().forEach(t => t.stop())
    camStreamRef.current = null
    setCamStream(null)

    try {
      const constraints = {
        video: deviceId
          ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      }
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      camStreamRef.current = stream
      setCamStream(stream)
      return stream
    } catch (e) {
      console.warn('[LocalMedia] camera error:', e.message)
      setHasPermission(false)
      return null
    }
  }, [])

  const disableCamera = useCallback(() => {
    camStreamRef.current?.getTracks().forEach(t => t.stop())
    camStreamRef.current = null
    setCamStream(null)
  }, [])

  /* ── microphone ─────────────────────────────────────────────── */
  const enableMic = useCallback(async (deviceId) => {
    micStreamRef.current?.getTracks().forEach(t => t.stop())
    micStreamRef.current = null

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId
          ? { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true }
          : { echoCancellation: true, noiseSuppression: true },
        video: false,
      })
      micStreamRef.current = stream
      setMicStream(stream)
      setMicActive(true)
    } catch (e) {
      console.warn('[LocalMedia] mic error:', e.message)
      setMicActive(false)
    }
  }, [])

  const disableMic = useCallback(() => {
    micStreamRef.current?.getTracks().forEach(t => t.stop())
    micStreamRef.current = null
    setMicStream(null)
    setMicActive(false)
  }, [])

  /* ── cleanup on unmount ─────────────────────────────────────── */
  useEffect(() => {
    return () => {
      camStreamRef.current?.getTracks().forEach(t => t.stop())
      micStreamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  return {
    devices,
    selectedCam, setSelectedCam,
    selectedMic, setSelectedMic,
    hasPermission,
    requestPermissions,
    refreshDevices,
    camStream,
    micStream,
    micActive,
    enableCamera,
    disableCamera,
    enableMic,
    disableMic,
  }
}
