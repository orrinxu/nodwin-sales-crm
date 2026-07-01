-- supabase/migrations/20260619000007_ai_openai_compatible_provider.sql
--
-- AI gateway (ORR-600 #5): add a generic OpenAI-compatible provider so any
-- OpenAI-compatible endpoint (OpenAI, Ollama, LM Studio, llama.cpp, a self-hosted
-- Qwen box, etc.) can be used via env config without code changes. ai_usage.provider
-- is an enum, so the new value must be registered for usage logging to accept it.

ALTER TYPE public.ai_provider ADD VALUE IF NOT EXISTS 'openai_compatible';
