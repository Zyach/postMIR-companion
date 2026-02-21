# AGENTS.md — postMIR-companion (Project Agent)

## Propósito
Explorador de plazas PostMIR con UI web Streamlit sobre dataset local.

## Control plane (read-only)
- SITEMAP: `~/agent-core/SITEMAP.json` (leer, nunca escribir)
- JOURNAL: `~/agent-core/JOURNAL.md` (leer para contexto)

## Capabilities disponibles (vía SITEMAP)
| Capability | Layer | Invocación |
|---|---|---|
| host_command_exec | termux_host | `~/.local/bin/termux-cmd.sh <cmd>` |
| battery_thermal_status | ubuntu_guest | `python3 ~/agent-core/sensors.py` |
| thermal_monitoring | ubuntu_guest | `~/.local/bin/thermal-guard.py status` |
| notify | termux_host | vía `termux-cmd.sh` |

## Reglas de ejecución
- Capa HOST (termux-*, rish, am/pm/dumpsys): delegar vía `termux-cmd.sh` o `termux-bridge.sh`.
- No modificar archivos fuera de este repo.
- No acciones destructivas sin confirmación.

## Workflow (fases)
1. **Análisis**: leer código, entender estado actual, consultar SITEMAP.
2. **Plan**: ≤10 pasos, mostrar diff antes de aplicar.
3. **Ejecución**: cambios mínimos, verificar tras cada paso.
4. **Registro**: si el cambio afecta al stack, notificar al OS Agent para que actualice JOURNAL/SITEMAP.

## Guardarraíles
- Mostrar diff antes de editar.
- Confirmar antes de borrar archivos o ejecutar comandos con side_effects != "none".
- Iteración 1 en modo auto; escalar si hay ambigüedad.
