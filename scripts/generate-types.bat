@echo off
REM Generate TypeScript types from Supabase database
REM Requires: Supabase CLI installed and project linked

echo Genererer TypeScript types fra Supabase database...

REM Check if Supabase CLI is installed
where supabase >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Supabase CLI er ikke installeret.
    echo Installer det med: npm install -g supabase
    exit /b 1
)

REM Check if project is linked
if not exist ".supabase\config.toml" (
    echo Projekt er ikke linket til Supabase.
    echo Kor: supabase link --project-ref your-project-ref
    exit /b 1
)

REM Generate types
echo Genererer types...
supabase gen types typescript --linked > src\types\database.types.ts

if %ERRORLEVEL% EQU 0 (
    echo Types genereret successfully!
    echo Fil: src\types\database.types.ts
) else (
    echo Fejl ved generering af types
    exit /b 1
)
