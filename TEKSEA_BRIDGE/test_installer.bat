@echo off
setlocal enableextensions enabledelayedexpansion
title Testador - TPS SCR Calibrador Installer

:: ============================================================
::   test_installer.bat
::   Valida os pre-requisitos do install_TPS_SCR_calibrador.bat
::   NAO faz alteracoes no sistema. Apenas verifica.
:: ============================================================

set ERROS=0
set AVISOS=0

cls
echo.
echo  ================================================
echo    TESTADOR DO INSTALADOR - TEKSEA BRIDGE
echo    Verificando pre-requisitos sem alterar o sistema
echo  ================================================
echo.

:: ============================================================
:: TESTE 0: Permissao de Administrador
:: ============================================================
echo [TESTE 0] Permissao de Administrador...
net session >nul 2>&1
if %errorLevel% equ 0 (
    echo  [OK] Rodando como Administrador.
) else (
    echo  [AVISO] NAO esta rodando como Administrador.
    echo          O instalador real falharia no Passo 0.
    echo          Execute este testador como Admin para resultado completo.
    set /a AVISOS+=1
)
echo.

:: ============================================================
:: TESTE 1: Python no PATH
:: ============================================================
echo [TESTE 1] Python instalado e no PATH...
python --version >nul 2>nul
if %errorLevel% neq 0 (
    echo  [ERRO] Python NAO encontrado no PATH.
    echo         Instale o Python 3.11 e marque "Add Python to PATH".
    set /a ERROS+=1
) else (
    for /f "tokens=2" %%v in ('python --version') do set PYVER=%%v
    echo  [OK] Python encontrado: !PYVER!
)
echo.

:: ============================================================
:: TESTE 2: Versao 3.11.x
:: ============================================================
echo [TESTE 2] Versao Python 3.11...
if defined PYVER (
    echo !PYVER! | findstr /r "^3\.11\." >nul
    if %errorLevel% equ 0 (
        echo  [OK] Versao !PYVER! e 3.11.x - compativel.
    ) else (
        echo  [AVISO] Versao !PYVER! nao e 3.11.x.
        echo          O instalador vai perguntar se deseja continuar.
        set /a AVISOS+=1
    )
) else (
    echo  [PULADO] Python nao encontrado no teste anterior.
)
echo.

:: ============================================================
:: TESTE 3: pip disponivel
:: ============================================================
echo [TESTE 3] pip disponivel...
python -m pip --version >nul 2>nul
if %errorLevel% neq 0 (
    echo  [ERRO] pip NAO encontrado.
    echo         Execute: python -m ensurepip
    set /a ERROS+=1
) else (
    for /f "tokens=2" %%v in ('python -m pip --version') do set PIPVER=%%v
    echo  [OK] pip !PIPVER! disponivel.
)
echo.

:: ============================================================
:: TESTE 4: Bibliotecas msal e requests
:: ============================================================
echo [TESTE 4] Bibliotecas msal e requests instaladas...
python -c "import msal" >nul 2>nul
if %errorLevel% neq 0 (
    echo  [AVISO] 'msal' nao instalada. O instalador fara o pip install.
    set /a AVISOS+=1
) else (
    echo  [OK] msal encontrada.
)

python -c "import requests" >nul 2>nul
if %errorLevel% neq 0 (
    echo  [AVISO] 'requests' nao instalada. O instalador fara o pip install.
    set /a AVISOS+=1
) else (
    echo  [OK] requests encontrada.
)
echo.

:: ============================================================
:: TESTE 5: pythonw.exe existe
:: ============================================================
echo [TESTE 5] pythonw.exe disponivel...
python -c "import sys, os; print(os.path.join(os.path.dirname(sys.executable), 'pythonw.exe'))" > "%temp%\pythonw_path.txt" 2>nul
set /p PYTHONW_PATH= < "%temp%\pythonw_path.txt"
del "%temp%\pythonw_path.txt" >nul 2>nul

if exist "!PYTHONW_PATH!" (
    echo  [OK] pythonw.exe encontrado em:
    echo       !PYTHONW_PATH!
) else (
    echo  [AVISO] pythonw.exe nao encontrado. O instalador usara python.exe.
    echo          O Bridge abrira com uma janela preta visivel.
    set /a AVISOS+=1
)
echo.

:: ============================================================
:: TESTE 6: teksea_bridge.py existe na mesma pasta
:: ============================================================
echo [TESTE 6] teksea_bridge.py na mesma pasta...
if exist "%~dp0teksea_bridge.py" (
    echo  [OK] teksea_bridge.py encontrado em:
    echo       %~dp0teksea_bridge.py
) else (
    echo  [ERRO] teksea_bridge.py NAO encontrado em: %~dp0
    echo         O arquivo deve estar na mesma pasta que o instalador.
    set /a ERROS+=1
)
echo.

:: ============================================================
:: TESTE 7: PowerShell disponivel (usado para gerar o .reg)
:: ============================================================
echo [TESTE 7] PowerShell disponivel...
powershell -NoProfile -Command "exit 0" >nul 2>&1
if %errorLevel% equ 0 (
    echo  [OK] PowerShell disponivel.
) else (
    echo  [ERRO] PowerShell NAO disponivel.
    echo         O Passo 3 do instalador falharia ao gerar o arquivo .reg.
    set /a ERROS+=1
)
echo.

:: ============================================================
:: TESTE 8: Permissao de escrita no Registro (requer Admin)
:: ============================================================
echo [TESTE 8] Permissao de escrita no Registro do Windows...
net session >nul 2>&1
if %errorLevel% equ 0 (
    reg add "HKLM\SOFTWARE\TekseaTestWrite" /v "teste" /t REG_SZ /d "ok" /f >nul 2>&1
    if %errorLevel% equ 0 (
        reg delete "HKLM\SOFTWARE\TekseaTestWrite" /f >nul 2>&1
        echo  [OK] Escrita no Registro funcionando.
    ) else (
        echo  [ERRO] Sem permissao para escrever no Registro.
        set /a ERROS+=1
    )
) else (
    echo  [PULADO] Requer Admin. Execute o testador como Administrador.
)
echo.

:: ============================================================
:: RESULTADO FINAL
:: ============================================================
echo  ================================================
if %ERROS% equ 0 (
    if %AVISOS% equ 0 (
        echo   RESULTADO: TUDO OK!
        echo   O instalador deve rodar sem problemas.
    ) else (
        echo   RESULTADO: OK COM !AVISOS! AVISO^(S^)
        echo   O instalador deve funcionar, verifique os avisos acima.
    )
) else (
    echo   RESULTADO: !ERROS! ERRO^(S^) ENCONTRADO^(S^)
    echo   Corrija os erros antes de executar o instalador.
)
echo.
echo   Erros:  %ERROS%
echo   Avisos: %AVISOS%
echo  ================================================
echo.
pause
