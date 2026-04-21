@echo off
title CALIBRADOR TPS/SCR - GitHub Sync Tool

:menu
echo.
echo ======================================================
echo          GERENCIADOR DE VERSAO - TEKSEA 2026
echo ======================================================
echo [1] Status do Repositorio (git status)
echo [2] Sincronizacao Rapida (Add + Commit + Push)
echo [3] Sincronizacao Customizada (Add + Mensagem + Push)
echo [4] Configurar Link do GitHub (Remote Origin)
echo [5] Visualizar Log de Commits
echo [Q] Sair
echo ======================================================
set "opt="
set /p opt="Sua escolha: "

if "%opt%"=="1" goto status
if "%opt%"=="2" goto fast_sync
if "%opt%"=="3" goto custom_sync
if "%opt%"=="4" goto config_remote
if "%opt%"=="5" goto view_log
if /i "%opt%"=="q" exit

echo Opcao invalida. Digite de 1 a 5 ou Q.
pause
goto menu

:status
echo.
echo --- Verificando Status...
git status
echo.
pause
goto menu

:fast_sync
echo.
echo --- Iniciando Sincronizacao Rapida...
git add .
git commit -m "Update Automatico via Script"
echo.
echo --- Enviando para o GitHub...
git push origin main
echo.
pause
goto menu

:custom_sync
echo.
echo --- Iniciando Sincronizacao Customizada...
git add .
echo.
set "commit_msg="
set /p "commit_msg=Digite a mensagem do commit: "
if "%commit_msg%"=="" set commit_msg=Update manual via script
git commit -m "%commit_msg%"
echo.
echo --- Enviando para o GitHub...
git push origin main
echo.
pause
goto menu

:config_remote
echo.
echo --- Configurando Remote...
git remote -v
echo.
set "remote_url="
set /p "remote_url=Cole a URL do GitHub: "
if not "%remote_url%"=="" (
    git remote remove origin >nul 2>&1
    git remote add origin %remote_url%
    git branch -M main
    echo --- Link configurado!
)
pause
goto menu

:view_log
echo.
echo --- Historico de Commits (Ultimos 10):
git log -n 10 --oneline --graph --decorate
echo.
pause
goto menu
