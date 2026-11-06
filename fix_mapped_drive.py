import os
import shutil

Import("env")

_orig_realpath = os.path.realpath


def _safe_realpath(path, *args, **kwargs):
    """Preserva a letra da unidade mapeada (ex.: X:\\) no Windows.

    Em unidades de rede mapeadas, os.path.realpath() converte o caminho para UNC
    (\\\\servidor\\compartilhamento\\...), e o SCons do PlatformIO corrompe o
    prefixo UNC para /servidor/..., causando erro 'No such file or directory'
    no GCC.
    """
    resolved = _orig_realpath(path, *args, **kwargs)
    if isinstance(resolved, str) and resolved.startswith("\\\\"):
        abs_path = os.path.abspath(os.fspath(path))
        if isinstance(abs_path, str) and not abs_path.startswith("\\\\"):
            return abs_path
    return resolved


os.path.realpath = _safe_realpath


def _clean_stale_cmake_cache():
    """Limpa automaticamente o cache de build (.pio/build/<env>) caso a pasta raiz
    do projeto tenha sido renomeada, movida de lugar ou copiada de outro PC.
    """
    project_dir = os.path.normcase(os.path.abspath(env.subst("$PROJECT_DIR"))).replace("\\", "/")
    build_dir = os.path.abspath(env.subst("$BUILD_DIR"))
    cmake_cache = os.path.join(build_dir, "CMakeCache.txt")
    if not os.path.isfile(cmake_cache):
        return

    cached_home = None
    cached_cmake = None
    try:
        with open(cmake_cache, "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                if line.startswith("CMAKE_HOME_DIRECTORY:INTERNAL="):
                    cached_home = os.path.normcase(line.split("=", 1)[1].strip()).replace("\\", "/")
                elif line.startswith("CMAKE_COMMAND:INTERNAL="):
                    cached_cmake = line.split("=", 1)[1].strip()
    except OSError:
        return

    cmake_moved = bool(cached_cmake and not os.path.isfile(cached_cmake))
    dir_moved = bool(cached_home and cached_home != project_dir)

    if dir_moved or cmake_moved:
        print("=== [AUTO-FIX] Projeto movido ou renomeado detectado. Limpando cache antigo do CMake...")
        shutil.rmtree(build_dir, ignore_errors=True)


_clean_stale_cmake_cache()
