"""Minimal ctypes binding to the OpenImageDenoise library shipped inside the bpy wheel (RTLightmap filter)."""
import ctypes, os, glob, numpy as np
import importlib.util
_libdir = os.path.join(os.path.dirname(importlib.util.find_spec('bpy').origin), 'lib')
for dep in sorted(glob.glob(os.path.join(_libdir, 'libtbb*.so*'))):
    try: ctypes.CDLL(dep, mode=ctypes.RTLD_GLOBAL)
    except OSError: pass
_L = ctypes.CDLL(os.path.join(_libdir, 'libOpenImageDenoise.so.2'))
_L.oidnNewDevice.restype = ctypes.c_void_p
_L.oidnNewFilter.restype = ctypes.c_void_p
_L.oidnNewFilter.argtypes = [ctypes.c_void_p, ctypes.c_char_p]
_L.oidnCommitDevice.argtypes = [ctypes.c_void_p]
_L.oidnSetSharedFilterImage.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_void_p, ctypes.c_int, ctypes.c_size_t, ctypes.c_size_t, ctypes.c_size_t, ctypes.c_size_t, ctypes.c_size_t]
_L.oidnSetFilterBool.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_bool]
_L.oidnCommitFilter.argtypes = [ctypes.c_void_p]
_L.oidnExecuteFilter.argtypes = [ctypes.c_void_p]
_L.oidnGetDeviceError.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_char_p)]
_L.oidnGetDeviceError.restype = ctypes.c_int

def denoise_lightmap(img):
    img = np.ascontiguousarray(img, dtype=np.float32)
    out = np.empty_like(img)
    h, w = img.shape[:2]
    dev = _L.oidnNewDevice(1)  # CPU
    _L.oidnCommitDevice(dev)
    f = _L.oidnNewFilter(dev, b'RT')
    _L.oidnSetFilterBool(f, b'hdr', True)
    _L.oidnSetSharedFilterImage(f, b'color', img.ctypes.data, 3, w, h, 0, 0, 0)
    _L.oidnSetSharedFilterImage(f, b'output', out.ctypes.data, 3, w, h, 0, 0, 0)
    _L.oidnCommitFilter(f)
    _L.oidnExecuteFilter(f)
    msg = ctypes.c_char_p()
    if _L.oidnGetDeviceError(dev, ctypes.byref(msg)):
        raise RuntimeError(msg.value)
    return out
