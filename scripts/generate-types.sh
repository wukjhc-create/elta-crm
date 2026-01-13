#!/bin/bash

# Generate TypeScript types from Supabase database
# Requires: Supabase CLI installed and project linked

echo "🔄 Genererer TypeScript types fra Supabase database..."

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI er ikke installeret."
    echo "Installer det med: npm install -g supabase"
    exit 1
fi

# Check if project is linked
if [ ! -f ".supabase/config.toml" ]; then
    echo "⚠️  Projekt er ikke linket til Supabase."
    echo "Kør: supabase link --project-ref your-project-ref"
    exit 1
fi

# Generate types
echo "📝 Genererer types..."
supabase gen types typescript --linked > src/types/database.types.ts

if [ $? -eq 0 ]; then
    echo "✅ Types genereret successfully!"
    echo "📁 Fil: src/types/database.types.ts"
else
    echo "❌ Fejl ved generering af types"
    exit 1
fi
