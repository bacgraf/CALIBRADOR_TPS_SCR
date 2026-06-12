@echo off
setlocal enableextensions
chcp 65001 >nul 2>&1
title Desinstalador - TPS SCR Calibrador

:: Verifica Admin
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Solicitando privilegios de Administrador...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

cls
echo.
echo  ================================================
echo    TEKSEA UNIFIED BRIDGE - DESINSTALADOR
echo  ================================================
echo.

echo [1/2] Removendo protocolo teksea:// do Windows Registry...
reg delete "HKEY_CLASSES_ROOT\teksea" /f >nul 2>&1
echo  OK.

echo [2/2] Removendo whitelist dos navegadores...
reg delete "HKLM\SOFTWARE\Policies\Microsoft\Edge"              /v "AutoLaunchProtocolsFromOrigins" /f >nul 2>&1
reg delete "HKLM\SOFTWARE\Policies\Microsoft\Edge\URLAllowlist" /v "1"                              /f >nul 2>&1
reg delete "HKLM\SOFTWARE\Policies\Google\Chrome"               /v "AutoLaunchProtocolsFromOrigins" /f >nul 2>&1
reg delete "HKLM\SOFTWARE\Policies\Google\Chrome\URLAllowlist"  /v "1"                              /f >nul 2>&1
echo  OK.

echo.
echo  ================================================
echo   DESINSTALACAO CONCLUIDA.
echo   O protocolo teksea:// foi removido do sistema.
echo  ================================================
echo.
pause
