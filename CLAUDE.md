# CLAUDE.md — Backend Nueva Tendencia

## Resumen del proyecto

API REST para **Calzados Nueva Tendencia**, una empresa de fabricación y venta de calzado. Backend en **NestJS 11 + TypeScript**, desplegado en **Render**. El frontend React vive en un repositorio separado, desplegado en Vercel (`https://nueva-tendencia-frontend.vercel.app`).

- Puerto de desarrollo: `3000`
- Swagger: `http://localhost:3000/api`
- Archivos estáticos: `uploads/` servido en `/uploads/`

---

## Base de datos

- **ORM**: TypeORM 0.3 con driver `pg`
- **Motor**: PostgreSQL en la nube (Supabase)
  - Puerto por defecto: `5432`
  - SSL habilitado (`ssl: true`)
- `synchronize: false` — los cambios de esquema deben hacerse con migraciones o manualmente en la BD
- Variables de entorno: `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME`

### Entidades principales

| Entidad | Tabla | Descripción |
|---------|-------|-------------|
| `User` | `user` | Usuarios del sistema (admin/operario) |
| `Producto` | `productos` | Catálogo de calzados con stock, precio, imagen |
| `Cliente` | `cliente` | Clientes individuales/empresas |
| `Pedido` | `pedidos` | Órdenes de producción con flujo Kanban |
| `TallaDetalle` | `talla_detalle` | Distribución de tallas por pedido |
| `Kardex` | `kardex` | Historial de movimientos de stock |
| `Insumo` | `insumos` | Materiales de producción (pegamento, cuero, etc.) |
| `CategoriaInsumo` | `categorias_insumo` | Categorías gestionables de Insumo (material, adhesivo, cuero, etc.) |
| `Auditoria` | `auditoria` | Log de acciones del sistema |

---

## Autenticación y autorización

- **JWT** firmado con `@nestjs/jwt` (secret en código; mover a env en producción)
  - Expiración: 1 hora
  - Payload: `{ sub: userId, email, role }`
- **Guard global**: `RolesGuard` verifica el token en **todos** los endpoints
  - `@Public()` — exime al endpoint de autenticación
  - `@Roles('admin')` — restringe a solo admins
- **Roles disponibles**: `admin`, `operario`, `user`
  - `admin`: acceso total
  - `operario`: solo `GET` y `PATCH` (sin crear ni borrar)
- **Rate limiting global**: 100 req/IP cada 60 s (`ThrottlerGuard`)
  - Login específico: 5 intentos/IP cada 60 s
- **Seguridad HTTP**: Helmet habilitado con `crossOriginResourcePolicy: 'cross-origin'`
- **CORS**: solo permite `localhost:5173` y el dominio de Vercel

---

## Módulos y responsabilidades

| Módulo | Controller base | Responsabilidad |
|--------|----------------|-----------------|
| `AuthModule` | `/auth` | Login, registro, registro de operarios |
| `UserModule` | `/users` | Gestión de usuarios (solo admin) |
| `ProductoModule` | `/productos` | CRUD de calzados + subida de imagen a Cloudinary |
| `ClienteModule` | `/clientes` | CRUD de clientes |
| `PedidoModule` | `/pedidos` + `/publico/pedido` | Pedidos, Kanban, seguimiento público por token |
| `TallaModule` | — (servicio interno) | Distribución de tallas por pedido y categoría |
| `KardexModule` | `/kardex` | Movimientos de stock (entrada/salida) |
| `InsumoModule` | `/insumos` | CRUD de insumos + alertas de stock bajo |
| `CategoriaInsumoModule` | `/categorias-insumo` | CRUD de categorías de insumo (usado por el selector de tipo en Insumos) |
| `DashboardModule` | `/dashboard` | KPIs, gráficas, predicción de stock |
| `ReportesModule` | `/reportes` | Exportación PDF y Excel (ventas, pedidos, stock, ganancias) |
| `AuditoriaModule` | `/auditoria` | Log de acciones; solo admin puede consultarlo |
| `AssistantModule` | `/assistant` | Chat con IA usando Google Generative AI (Gemini) |
| `TelegramModule` | `/telegram` | Envío de resumen diario vía bot de Telegram |

---

## Endpoints por módulo

### Auth — `/auth`
| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/auth/login` | Público (5 req/min) | Login → devuelve JWT + user en el body, y además setea cookie HttpOnly `access_token` (transición; el guard aún no la usa para autenticar) |
| POST | `/auth/logout` | Público | Limpia la cookie `access_token` |
| POST | `/auth/register` | Público | Registro de usuario |
| POST | `/auth/register-operario` | Admin | Crea operario |

### Productos — `/productos`
| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/productos` | Autenticado | Lista todos |
| GET | `/productos/alertas-stock` | Autenticado | Productos bajo nivel mínimo |
| GET | `/productos/:id` | Autenticado | Detalle |
| POST | `/productos` | Admin | Crear con imagen (multipart) |
| PATCH | `/productos/:id` | Admin | Actualizar con imagen opcional |
| DELETE | `/productos/:id` | Admin | Eliminar |

### Clientes — `/clientes`
| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/clientes` | Autenticado | Lista todos |
| GET | `/clientes/:id` | Autenticado | Detalle |
| POST | `/clientes` | Admin | Crear |
| PATCH | `/clientes/:id` | Admin | Actualizar |
| DELETE | `/clientes/:id` | Admin | Eliminar |

### Pedidos — `/pedidos`
| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/pedidos` | Autenticado | Lista (filtros: `?cliente=` `?producto=`) |
| GET | `/pedidos/kanban` | Autenticado | Agrupado por estado para Kanban |
| GET | `/pedidos/:id` | Autenticado | Detalle |
| POST | `/pedidos` | Admin | Crear |
| PATCH | `/pedidos/:id/mover` | Autenticado | Cambiar estado en Kanban |
| PATCH | `/pedidos/:id/tallas` | Autenticado | Actualizar distribución de tallas |
| PATCH | `/pedidos/:id` | Autenticado | Actualizar datos del pedido |
| DELETE | `/pedidos/:id` | Admin | Eliminar |

### Pedido público (sin auth) — `/publico/pedido`
| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/publico/pedido/:id` | Público | Estado del pedido por ID |
| GET | `/publico/pedido/token/:token` | Público | Estado del pedido por token de seguimiento |

### Kardex — `/kardex`
| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/kardex` | Autenticado | Todos los movimientos (`?producto=id`) |
| GET | `/kardex/producto/:id` | Autenticado | Historial de un producto |
| POST | `/kardex` | Autenticado | Registrar movimiento |

### Insumos — `/insumos`
| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/insumos` | Autenticado | Lista todos |
| GET | `/insumos/alertas` | Autenticado | Con stock bajo mínimo |
| GET | `/insumos/:id` | Autenticado | Detalle |
| POST | `/insumos` | Admin | Crear |
| PATCH | `/insumos/:id` | Admin | Actualizar |
| POST | `/insumos/:id/imagen` | Admin | Subir imagen (disk storage local) |
| DELETE | `/insumos/:id` | Admin | Eliminar |

### Categorías de insumo — `/categorias-insumo`
| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/categorias-insumo` | Autenticado | Lista todas (para poblar selectores) |
| GET | `/categorias-insumo/:id` | Autenticado | Detalle |
| POST | `/categorias-insumo` | Admin | Crear |
| PATCH | `/categorias-insumo/:id` | Admin | Actualizar |
| DELETE | `/categorias-insumo/:id` | Admin | Eliminar (bloqueado si hay insumos usándola) |

### Dashboard — `/dashboard`
| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/dashboard/kpis` | Autenticado | Métricas principales |
| GET | `/dashboard/orders-status` | Autenticado | Conteo por estado |
| GET | `/dashboard/production-funnel` | Autenticado | Embudo de producción |
| GET | `/dashboard/top-productos` | Autenticado | Productos más vendidos |
| GET | `/dashboard/ventas-por-mes` | Autenticado | Histórico mensual |
| GET | `/dashboard/prediccion-stock` | Autenticado | Predicción de reposición |
| GET | `/dashboard/recent-activity` | Autenticado | Actividad reciente |
| GET | `/dashboard/proximos-a-entregar` | Autenticado | Pedidos próximos a vencer |

### Reportes — `/reportes` (todos exigen JWT vía `@Roles`, ninguno es `@Public()`)
| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/reportes/pdf/ventas?year=` | Admin | PDF de ventas por año |
| GET | `/reportes/pdf/pedidos` | Admin, operario | PDF de pedidos |
| GET | `/reportes/pdf/stock` | Admin, operario | PDF de stock crítico |
| GET | `/reportes/pdf/pedidos-entregados` | Admin, operario | PDF de pedidos entregados |
| GET | `/reportes/pdf/ganancias?month=&year=` | Admin | PDF de ganancias |
| GET | `/reportes/pdf/diario` | Admin | PDF del reporte diario |
| GET | `/reportes/excel/pedidos-entregados` | Admin, operario | Excel pedidos entregados |
| GET | `/reportes/excel/ganancias?month=&year=` | Admin | Excel ganancias |
| GET | `/reportes/excel/pedidos` | Admin, operario | Excel todos los pedidos |
| GET | `/reportes/excel/clientes` | Admin | Excel clientes |
| GET | `/reportes/excel/stock` | Admin, operario | Excel stock |
| GET | `/reportes/excel/diario` | Admin | Excel reporte diario |
| GET | `/reportes/diario` | Admin | JSON resumen diario |

### Auditoría — `/auditoria` (solo admin)
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/auditoria` | Todos los registros |
| GET | `/auditoria/modulo/:modulo` | Filtrado por módulo |
| GET | `/auditoria/usuario/:id` | Filtrado por usuario |
| DELETE | `/auditoria/limpiar?before=YYYY-MM` | Eliminar registros anteriores a fecha |

### Asistente IA — `/assistant`
| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/assistant/chat` | Público | Chat con Gemini (historial opcional) |

### Telegram — `/telegram`
| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/telegram/test-resumen` | Público | Dispara envío del resumen diario |

### Usuarios — `/users`
| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/users` | Admin | Lista usuarios (placeholder) |

---

## Integraciones externas

| Servicio | Uso | Variable de entorno |
|----------|-----|---------------------|
| **Cloudinary** | Imágenes de productos | `CLOUDINARY_*` |
| **Google Generative AI (Gemini)** | Asistente IA | `GEMINI_API_KEY` |
| **Telegram Bot** | Notificaciones/resumen diario | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` |
| **Aiven MySQL** | Base de datos | `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME` |

---

## Flujo del pedido (Kanban)

```
Pendiente → Cortado → Aparado → Solado → Empaque → Terminado
```

Cada pedido tiene un `token_seguimiento` UUID para que el cliente pueda consultar el estado públicamente sin autenticación.

---

## Comandos útiles

```bash
npm run start:dev     # Desarrollo con hot-reload
npm run build         # Compilar para producción
npm run start:prod    # Ejecutar build
npm run test          # Tests unitarios
npm run test:e2e      # Tests end-to-end
```

---

## Notas importantes

- El JWT secret está hardcodeado en `auth.module.ts` — debe moverse a variable de entorno (`JWT_SECRET`) para producción real.
- `synchronize: false` — nunca activar en producción; usar migraciones TypeORM.
- Las imágenes de **insumos** se guardan en disco local (`uploads/insumos/`); las de **productos** van a Cloudinary.
- El módulo `TallaModule` no tiene controller propio; `TallaService` es consumido por `PedidoController` vía `PATCH /pedidos/:id/tallas`.
- `ScheduleModule` está registrado; revisar `TelegramService` y `DiarioService` para ver los cron jobs activos.
