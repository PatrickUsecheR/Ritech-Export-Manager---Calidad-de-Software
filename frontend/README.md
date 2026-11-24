# Ritech Export Manager frontend

Standalone Angular 20 app for the Ritech export workflow.

## Run locally

Start Django at `http://localhost:8000`, then run:

```powershell
npm install
npm start
```

The production bundle is built with `npm run build`; unit tests run with
`npm test -- --watch=false`. Configure the API root in
`src/environments/environment.ts`.

## Django API

The app uses the Django REST Framework endpoints at `/api/`:

- Authentication: `auth/register/`, `auth/login/`, `auth/refresh/`
- Dashboard: `dashboard/`
- CRUD: `usuarios/`, `permisos/`, `proveedores/`, `productos/`, `clientes/`,
  `lotes/`, `certificaciones/`, `ordenes/`
- Public traceability lookup: `trazabilidad/{codigo}/` or
  `trazabilidad/?codigo_lote=...` / `trazabilidad/?codigo_orden=...`
- Authenticated traceability event creation:
  `trazabilidad/{codigo_orden}/eventos/`

List services accept Django REST Framework arrays and paginated
`{ "results": [...] }` responses. Certificates upload PDF files (maximum 5 MB).
Export-order details include lot, quantity and EUR/kg price; the API returns
the calculated EUR/COP totals and line subtotals.
