@echo off
setlocal enableextensions enabledelayedexpansion
title Instalador Automatico - TEKSEA Bridge v2.1.0

:: ============================================================
::   instalar_bridge.bat
::   Instala/atualiza o TEKSEA Bridge em Documents\TEKSEA_BRIDGE
::   Sem problemas de permissao em C:\ ou perda de rede no RunAs
:: ============================================================

:: Modo interno elevado (apenas politicas do navegador + driver USB)
if "%~1"=="--elevated-policies" goto :elevated_policies

cls
echo.
echo  ================================================
echo    TEKSEA BRIDGE - INSTALADOR / ATUALIZADOR v2.1.0
echo    TPS125 / SCR Calibrador
echo  ================================================
echo.

set "INSTALL_DIR=%USERPROFILE%\Documents\TEKSEA_BRIDGE"
set "GH_RAW=https://raw.githubusercontent.com/bacgraf/CALIBRADOR_TPS_SCR/main/TEKSEA_BRIDGE"
set "GH_CCS_ZIP=https://github.com/bacgraf/CALIBRADOR_TPS_SCR/releases/latest/download/ccs_base.zip"
set "NET_SHARE=\\srv01\01 TEKSEA\111 PUB\01 INTRANET\Marcel Hilleshein\DEV\CALIBRADOR_TPS_SCR\TEKSEA_BRIDGE"

:: --- PASSO 1: Verificar Python ------------------------------
echo [1/5] Verificando instalacao do Python...
python --version >nul 2>nul
if %errorLevel% neq 0 (
    echo.
    echo  ERRO: Python nao encontrado no PATH do Windows!
    echo  Instale o Python 3.11 ^(marcando "Add Python to PATH"^) em:
    echo  https://www.python.org/downloads/release/python-3119/
    goto :falha
)
for /f "tokens=2" %%v in ('python --version') do set PYVER=%%v
echo  OK - Python detectado: %PYVER%
echo.

:: --- PASSO 2: Encerrar instancia anterior -------------------
echo [2/5] Encerrando instancia anterior do TEKSEA Bridge ^(se ativo^)...
curl.exe -s -X POST http://127.0.0.1:8760/sys/shutdown >nul 2>&1
timeout /t 1 /nobreak >nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process -Filter \"Name like 'python%'\" | Where-Object { $_.CommandLine -match 'teksea_bridge\.py' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1
timeout /t 1 /nobreak >nul

:: --- PASSO 3: Baixar / copiar arquivos no perfil do usuario -
echo [3/5] Atualizando arquivos em %INSTALL_DIR%...
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
if not exist "%INSTALL_DIR%\user_files\configs" mkdir "%INSTALL_DIR%\user_files\configs"
if not exist "%INSTALL_DIR%\user_files\settings" mkdir "%INSTALL_DIR%\user_files\settings"
if not exist "%INSTALL_DIR%\user_files\images" mkdir "%INSTALL_DIR%\user_files\images"

for %%F in (
    "teksea_bridge.py"
    "pit_parser.py"
    "flash_controller.py"
    "version.json"
    "install_TPS_SCR_calibrador.bat"
    "uninstall_TPS_SCR_calibrador.bat"
    "one_time_setup.bat"
    "kill_bridge.bat"
    "stop_bridge.py"
    "dpinst_64_eng.exe"
    "LEIAME.txt"
    "user_files/configs/tms320f28375s.ccxml"
    "user_files/settings/generated.ufsettings"
) do (
    set "REL=%%~F"
    set "WIN_REL=!REL:/=\!"
    curl.exe -fksSL "%GH_RAW%/!REL!" -o "%INSTALL_DIR%\!WIN_REL!" >nul 2>&1
    if !errorLevel! neq 0 (
        if exist "%NET_SHARE%\!WIN_REL!" (
            copy /y "%NET_SHARE%\!WIN_REL!" "%INSTALL_DIR%\!WIN_REL!" >nul
        )
    )
)

if not exist "%INSTALL_DIR%\teksea_bridge.py" (
    echo  ERRO: Nao foi possivel obter teksea_bridge.py da rede nem do GitHub.
    goto :falha
)

:: Verifica ccs_base (DSLite para gravacao JTAG)
if not exist "%INSTALL_DIR%\ccs_base\DebugServer\bin\DSLite.exe" (
    if exist "C:\TEKSEA_BRIDGE\ccs_base\DebugServer\bin\DSLite.exe" (
        echo  Copiando ccs_base de C:\TEKSEA_BRIDGE...
        robocopy "C:\TEKSEA_BRIDGE\ccs_base" "%INSTALL_DIR%\ccs_base" /E /NFL /NDL /NJH /NJS /NC /NS /NP >nul
    ) else if exist "%NET_SHARE%\ccs_base\DebugServer\bin\DSLite.exe" (
        echo  Copiando ccs_base da rede local...
        robocopy "%NET_SHARE%\ccs_base" "%INSTALL_DIR%\ccs_base" /E /NFL /NDL /NJH /NJS /NC /NS /NP >nul
    ) else (
        curl.exe -fksSL "%GH_CCS_ZIP%" -o "%temp%\ccs_base.zip" >nul 2>&1
        if !errorLevel! equ 0 (
            powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Path '%temp%\ccs_base.zip' -DestinationPath '%INSTALL_DIR%' -Force"
            del "%temp%\ccs_base.zip" >nul 2>&1
        )
    )
)
echo  OK - Arquivos prontos em %INSTALL_DIR%.
echo.

:: --- PASSO 4: Dependencias Python e Protocolo do Usuario ----
echo [4/5] Verificando dependencias Python e registrando protocolo teksea://...
python -m pip install --quiet --upgrade msal requests pymupdf python-docx

set "SCRIPT_PATH=%INSTALL_DIR%\teksea_bridge.py"
python -c "import sys, os; print(os.path.join(os.path.dirname(sys.executable), 'pythonw.exe'))" > "%temp%\pyw.txt"
set /p PYTHONW= < "%temp%\pyw.txt"
del "%temp%\pyw.txt" >nul 2>&1
if not exist "%PYTHONW%" (
    python -c "import sys; print(sys.executable)" > "%temp%\pyw.txt"
    set /p PYTHONW= < "%temp%\pyw.txt"
    del "%temp%\pyw.txt" >nul 2>&1
)

:: Registra em HKCU (nao exige Admin e tem precedencia sobre HKCR!)
reg add "HKCU\Software\Classes\teksea" /ve /t REG_SZ /d "URL:Teksea Protocol" /f >nul
reg add "HKCU\Software\Classes\teksea" /v "URL Protocol" /t REG_SZ /d "" /f >nul
reg add "HKCU\Software\Classes\teksea\shell\open\command" /ve /t REG_SZ /d "\"%PYTHONW%\" \"%SCRIPT_PATH%\" \"%%1\"" /f >nul
echo  OK - Protocolo teksea:// registrado para o usuario atual.
echo.

:: Aplica politicas de navegador/drivers se necessario (opcional com UAC)
reg query "HKLM\SOFTWARE\Policies\Google\Chrome\URLAllowlist" /v "1" >nul 2>&1
if %errorLevel% neq 0 (
    echo Aplicando permissoes automaticas do navegador ^(pode solicitar Administrador^)...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -ArgumentList '--elevated-policies','\"%PYTHONW%\"','\"%SCRIPT_PATH%\"','\"%INSTALL_DIR%\"' -Verb RunAs -Wait" >nul 2>&1
)

:: --- PASSO 5: Iniciar TEKSEA Bridge agora -------------------
echo [5/5] Iniciando TEKSEA Bridge v2.1.0 em segundo plano...
start "" "%PYTHONW%" "%SCRIPT_PATH%" "teksea://start"

echo.
echo  ================================================
echo   INSTALACAO CONCLUIDA COM SUCESSO!
echo   O TEKSEA Bridge v2.1.0 ja esta rodando!
echo   Retorne ao navegador ^(BRIDGE: OK v2.1.0^).
echo  ================================================
echo.
pause
exit /b 0

:elevated_policies
set "E_PYW=%~2"
set "E_SCRIPT=%~3"
set "E_DIR=%~4"
reg add "HKCR\teksea" /ve /t REG_SZ /d "URL:Teksea Protocol" /f >nul 2>&1
reg add "HKCR\teksea" /v "URL Protocol" /t REG_SZ /d "" /f >nul 2>&1
reg add "HKCR\teksea\shell\open\command" /ve /t REG_SZ /d "\"%E_PYW%\" \"%E_SCRIPT%\" \"%%1\"" /f >nul 2>&1
reg add "HKLM\SOFTWARE\Policies\Microsoft\Edge" /v "AutoLaunchProtocolsFromOrigins" /t REG_SZ /d "[{\"allowed_origins\": [\"*\"], \"protocol\": \"teksea\"}]" /f >nul 2>&1
reg add "HKLM\SOFTWARE\Policies\Microsoft\Edge\URLAllowlist" /v "1" /t REG_SZ /d "teksea://*" /f >nul 2>&1
reg add "HKLM\SOFTWARE\Policies\Google\Chrome" /v "AutoLaunchProtocolsFromOrigins" /t REG_SZ /d "[{\"allowed_origins\": [\"*\"], \"protocol\": \"teksea\"}]" /f >nul 2>&1
reg add "HKLM\SOFTWARE\Policies\Google\Chrome\URLAllowlist" /v "1" /t REG_SZ /d "teksea://*" /f >nul 2>&1
if exist "%E_DIR%\dpinst_64_eng.exe" if exist "%E_DIR%\ccs_base\emulation\windows\ftdi_drivers" (
    "%E_DIR%\dpinst_64_eng.exe" /SE /SW /SA /PATH "%E_DIR%\ccs_base\emulation\windows\ftdi_drivers" >nul 2>&1
)
exit /b 0

:falha
echo.
pause
exit /b 1
