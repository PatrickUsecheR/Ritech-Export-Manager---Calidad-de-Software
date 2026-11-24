# Informe de pruebas de RiTech

**Fecha:** 23 de noviembre de 2026  
**Proyecto:** RiTech Export Manager

## Resumen

| Revisi?n | Resultado | Alcance |
|---|---|---|
| API / integraci?n | 23 aprobadas, 0 fallidas; exit code 0 | SQLite; TEST-21 omitida por incompatibilidad de la comprobaci?n de concurrencia |
| TEST-21 | 5/5 aprobadas | PostgreSQL temporal y aislado |
| Playwright | 20/20 aprobadas en suite previa | Chromium y Edge; TEST-23 fue a?adida despu?s |
| TEST-23 | 2/2 aprobadas | Ejecuci?n dirigida en Chromium y Edge; no se repiti? la suite completa |
| Build Angular | Correcto | Compilaci?n reportada |
| TEST-22 | ~73 ms para 100 ?rdenes | Entorno local; no confirma 148 ms sobre PostgreSQL del PDF |

## Scripts reales

- API: `api/test_plan/test_users.py`, `test_catalog_traceability.py`, `test_inventory_orders.py`.
- Navegador: `frontend/e2e/*.spec.ts`, Playwright configurado en `frontend/playwright.config.ts`.
- Comandos: `manage.py test api.test_plan`, `npm run test:e2e`, `npm run build`.

## L?mites

Docker no estaba instalado. La suite general de API se ejecut? con SQLite; TEST-21 se comprob? aparte en PostgreSQL temporal. La suite E2E completa no se repiti? tras a?adir TEST-23. El PDF cita scripts Jasmine/Karma y `backend/api/tests.py` que no aparecen en esta copia.

## Veredicto

Los 26 casos tienen evidencia de aprobaci?n en el plan actualizado; comunicar los alcances anteriores y no atribuir a PostgreSQL resultados obtenidos con SQLite.
