@echo off
setlocal enableextensions

:: Verifica permissao de administrador
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Solicitando permissoes de administrador...
    powershell -Command "Start-Process '%0' -Verb RunAs"
    exit /b
)

echo Removendo Protocolo teksea-sn do Windows...
reg delete "HKEY_CLASSES_ROOT\teksea-sn" /f >nul 2>&1

echo Removendo excecoes de seguranca dos navegadores...
:: Chrome
reg delete "HKLM\SOFTWARE\Policies\Google\Chrome" /v "AutoLaunchProtocolsFromOrigins" /f >nul 2>&1
:: Edge
reg delete "HKLM\SOFTWARE\Policies\Microsoft\Edge" /v "AutoLaunchProtocolsFromOrigins" /f >nul 2>&1

echo.
echo ===================================================
echo DESINSTALACAO CONCLUIDA!
echo 1. O protocolo teksea-sn:// foi removido.
echo 2. As politicas de segurança foram resetadas.
echo ===================================================
pause
