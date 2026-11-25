@echo off
setlocal enableextensions enabledelayedexpansion
title Instalador - TPS SCR Calibrador

:: ============================================================
::   install_TPS_SCR_calibrador.bat
::   Protocolo: teksea://
::   Requerimento: Python 3.11
:: ============================================================

:: --- PASSO 0: Verificar permissao de Administrador ----------
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo.
    echo  ================================================
    echo    ERRO: Permissao de Administrador necessaria!
    echo.
    echo    Clique com o botao DIREITO no arquivo .bat
    echo    e selecione "Executar como administrador".
    echo  ================================================
    echo.
    pause
    exit /b 1
)

cls
echo.
echo  ================================================
echo    TEKSEA UNIFIED BRIDGE - INSTALADOR
echo    TPS / SCR Calibrador
echo  ================================================
echo.

:: --- PASSO 1: Verificar Python 3.11 ------------------------
echo [1/5] Verificando Python 3.11...

python --version >nul 2>nul
if %errorLevel% neq 0 (
    echo.
    echo  ERRO: Python nao encontrado no PATH!
    goto :falha
)

for /f "tokens=2" %%v in ('python --version') do set PYVER=%%v
echo  Python detectado: %PYVER%

echo %PYVER% | findstr /r "^3\.11\." >nul
if %errorLevel% neq 0 (
    echo.
    echo  AVISO: Versao detectada ^(%PYVER%^) nao e Python 3.11.
    choice /c SN /m "  Deseja continuar mesmo assim?"
    if !errorlevel! equ 2 goto :falha
)
echo.

:: --- PASSO 2: Instalar Dependencias Pip ---------------------
echo [2/5] Instalando dependencias Python (msal, requests, pymupdf, python-docx)...
python -m pip install --quiet --upgrade msal requests pymupdf python-docx
if %errorLevel% neq 0 (
    echo  ERRO ao instalar dependencias.
    goto :falha
)
echo  OK - Dependencias instaladas.
echo.

:: --- PASSO 3: Registrar Protocolo teksea:// -----------------
echo [3/5] Registrando protocolo teksea://...

set "SCRIPT_PATH=%~dp0teksea_bridge.py"

:: Busca o caminho do pythonw.exe
python -c "import sys, os; print(os.path.join(os.path.dirname(sys.executable), 'pythonw.exe'))" > "%temp%\pyw.txt"
set /p PYTHONW= < "%temp%\pyw.txt"
del "%temp%\pyw.txt"

if not exist "%PYTHONW%" (
    python -c "import sys; print(sys.executable)" > "%temp%\pyw.txt"
    set /p PYTHONW= < "%temp%\pyw.txt"
    del "%temp%\pyw.txt"
)

:: REGISTRO DIRETO (Mais confiavel que arquivo .reg)
set "REG_CMD=\"%PYTHONW%\" \"%SCRIPT_PATH%\" \"%%1\""

reg add "HKCR\teksea" /ve /t REG_SZ /d "URL:Teksea Protocol" /f >nul
reg add "HKCR\teksea" /v "URL Protocol" /t REG_SZ /d "" /f >nul
reg add "HKCR\teksea\shell\open\command" /ve /t REG_SZ /d "%REG_CMD%" /f >nul

echo  OK - Protocolo registrado para:
echo       %PYTHONW%
echo.

:: --- PASSO 4: Lista Branca nos Navegadores ------------------
echo [4/5] Aplicando whitelist nos navegadores (sem popups)...

:: Edge
reg add "HKLM\SOFTWARE\Policies\Microsoft\Edge" /v "AutoLaunchProtocolsFromOrigins" /t REG_SZ /d "[{\"allowed_origins\": [\"*\"], \"protocol\": \"teksea\"}]" /f >nul 2>&1
reg add "HKLM\SOFTWARE\Policies\Microsoft\Edge\URLAllowlist" /v "1" /t REG_SZ /d "teksea://*" /f >nul 2>&1

:: Chrome
reg add "HKLM\SOFTWARE\Policies\Google\Chrome" /v "AutoLaunchProtocolsFromOrigins" /t REG_SZ /d "[{\"allowed_origins\": [\"*\"], \"protocol\": \"teksea\"}]" /f >nul 2>&1
reg add "HKLM\SOFTWARE\Policies\Google\Chrome\URLAllowlist" /v "1" /t REG_SZ /d "teksea://*" /f >nul 2>&1

echo  OK - Whitelist aplicada.
echo.

:: --- PASSO 5: Limpar Protocolos Antigos ---------------------
echo [5/5] Removendo protocolos antigos...
reg delete "HKEY_CLASSES_ROOT\tms-flash" /f >nul 2>&1
reg delete "HKEY_CLASSES_ROOT\teksea-sn" /f >nul 2>&1

echo.
echo  ================================================
echo   INSTALACAO CONCLUIDA!
echo   Pode abrir o Calibrador agora.
echo  ================================================
echo.
pause
exit /b 0

:falha
echo.
pause
exit /b 1
