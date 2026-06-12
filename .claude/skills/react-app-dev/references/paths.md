# React Dev Paths

## Common folders
- `src/components/`
- `src/hooks/`
- `src/stores/`
- `src/providers/` (multi-provider LLM layer: Anthropic / OpenAI / Gemini / Ollama behind one interface)
- `src/lib/translation/`
- `src/lib/polish/`
- `src/services/`
- `src/pages/`
- `src/utils/`

## Useful scans
- `rg -n "use.*Store" src/components src/hooks`
- `rg -n "createProvider|ProviderInterface|provider" src/providers`
- `rg -n "stream|diff|accept|reject" src/lib src/components`
