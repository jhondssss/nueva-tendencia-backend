# Sistema de Gestión — Calzados Nueva Tendencia

API REST para la gestión integral de producción, inventario y ventas de **Calzados Nueva Tendencia**, una empresa fabricante y comercializadora de calzado.

**Tipo de proyecto:** Trabajo Dirigido — Universidad Adventista de Bolivia (UAB), 2026

---

## Problema que resuelve

La empresa gestionaba sus pedidos, stock e insumos de forma manual (hojas de cálculo, cuadernos). Este sistema centraliza:

- Seguimiento del flujo de producción en tablero Kanban
- Control de stock de productos e insumos con alertas automáticas
- Registro de pedidos con seguimiento público para clientes (sin autenticación)
- Reportes exportables en PDF y Excel
- Asistente de IA integrado (Google Gemini) para consultas rápidas
- Notificaciones diarias automáticas por Telegram

---

## Stack tecnológico

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Framework | NestJS | 11.0.1 |
| Lenguaje | TypeScript | 5.7.3 |
| Runtime | Node.js | ≥ 20 |
| Base de datos | PostgreSQL (Supabase) | — |
| ORM | TypeORM | 0.3.27 |
| Autenticación | JWT + RBAC | @nestjs/jwt 11.0.1 |
| Imágenes | Cloudinary | 2.9.0 |
| IA | Google Gemini 1.5 Flash | @google/generative-ai 0.24.1 |
| Notificaciones | Telegram Bot API | nativo |
| Reportes | PDFKit + ExcelJS | 0.17.2 / 4.4.0 |
| Documentación | Swagger / OpenAPI | @nestjs/swagger 11.2.0 |
| Deploy | Render | — |

---

## Arquitectura

El proyecto sigue principios de **Clean Architecture** organizados en cuatro capas por módulo:

```
Controller (HTTP)  →  Service (lógica de negocio)  →  Repository (TypeORM)  →  Entity (BD)
```

- **Principios SOLID** aplicados en servicios e inyección de dependencias
- **Patrón Repository** via TypeORM para desacoplar la persistencia
- **Guard global** de roles (RBAC) aplicado a todos los endpoints
- **Rate limiting** global (100 req/IP/min) y específico en login (5 req/IP/min)

---

## Variables de entorno

Crea un archivo `.env` en la raíz del proyecto con las siguientes variables:

```env
# Base de datos (PostgreSQL - Supabase)
DB_HOST=
DB_PORT=5432
DB_USERNAME=
DB_PASSWORD=
DB_NAME=

# Autenticación
JWT_SECRET=

# Google Gemini IA
GEMINI_API_KEY=

# Telegram Bot
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
TELEGRAM_BOT_USERNAME=

# Cloudinary (imágenes de productos)
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

---

## Instalación y ejecución local

```bash
# 1. Clonar el repositorio
git clone <url-del-repositorio>
cd nueva_tendencia

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales

# 4. Ejecutar en modo desarrollo
npm run start:dev
```

La API queda disponible en `http://localhost:3000`.
Swagger UI en `http://localhost:3000/api`.

---

## Comandos disponibles

```bash
npm run start:dev         # Desarrollo con hot-reload
npm run start:prod        # Ejecutar build de producción
npm run build             # Compilar TypeScript a dist/

npm run test              # Ejecutar tests unitarios
npm run test:cov          # Tests con reporte de cobertura

npm run migration:run     # Aplicar migraciones pendientes
npm run migration:revert  # Revertir última migración
npm run migration:show    # Ver estado de migraciones

npm run lint              # Linter ESLint + Prettier
npm run format            # Formatear código
```

---

## Estructura de carpetas

```
src/
├── app.module.ts              # Módulo raíz
├── main.ts                    # Bootstrap de la aplicación
│
├── auth/                      # Autenticación JWT, guards, decoradores
├── user/                      # Gestión de usuarios (solo admin)
├── cliente/                   # CRUD de clientes
├── producto/                  # Catálogo de calzados + Cloudinary
├── pedido/                    # Pedidos, Kanban, seguimiento público
├── talla/                     # Distribución de tallas por pedido
├── kardex/                    # Movimientos de stock
├── insumo/                    # Materiales de producción
├── dashboard/                 # KPIs, gráficas, predicción de stock
├── reportes/                  # Exportación PDF y Excel
├── auditoria/                 # Log de acciones del sistema
├── assistant/                 # Chat con IA (Google Gemini)
├── telegram/                  # Bot de Telegram + resumen diario
├── cloudinary/                # Módulo compartido de Cloudinary
├── keep-alive/                # Ping periódico para Render (free tier)
├── migrations/                # Migraciones TypeORM
└── seed/                      # Datos iniciales
```

---

## Endpoints principales

### Autenticación — `/auth`
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/auth/login` | Login → devuelve JWT |
| POST | `/auth/register` | Registro de usuario |
| POST | `/auth/register-operario` | Crear operario (solo admin) |

### Pedidos — `/pedidos`
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/pedidos` | Listar pedidos |
| GET | `/pedidos/kanban` | Vista Kanban agrupada por estado |
| POST | `/pedidos` | Crear pedido (admin) |
| PATCH | `/pedidos/:id/mover` | Avanzar estado en Kanban |
| PATCH | `/pedidos/:id/tallas` | Actualizar distribución de tallas |

### Seguimiento público — `/publico/pedido`
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/publico/pedido/:id` | Estado por ID (sin auth) |
| GET | `/publico/pedido/token/:token` | Estado por token de seguimiento |

### Productos — `/productos`
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/productos` | Listar productos |
| GET | `/productos/alertas-stock` | Productos bajo stock mínimo |
| POST | `/productos` | Crear con imagen (multipart) |
| PATCH | `/productos/:id` | Actualizar |

### Insumos — `/insumos`
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/insumos` | Listar insumos |
| GET | `/insumos/alertas` | Insumos con stock bajo mínimo |
| POST | `/insumos` | Crear insumo |

### Dashboard — `/dashboard`
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/dashboard/kpis` | Métricas principales |
| GET | `/dashboard/top-productos` | Productos más vendidos |
| GET | `/dashboard/prediccion-stock` | Predicción de reposición |
| GET | `/dashboard/proximos-a-entregar` | Pedidos próximos a vencer |

### Reportes — `/reportes`
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/reportes/pdf/ventas?year=` | PDF ventas por año |
| GET | `/reportes/pdf/stock` | PDF stock crítico |
| GET | `/reportes/excel/pedidos-entregados` | Excel pedidos entregados |
| GET | `/reportes/excel/ganancias?month=&year=` | Excel ganancias |
| GET | `/reportes/diario` | JSON resumen diario |

### Asistente IA — `/assistant`
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/assistant/chat` | Chat con Gemini |

---

## Flujo de producción (Kanban)

```
Pendiente → Cortado → Aparado → Solado → Empaque → Terminado
```

Cada pedido genera un `token_seguimiento` UUID que permite al cliente consultar el estado públicamente sin necesidad de autenticación.

---

## Tests

El proyecto cuenta con **18 tests unitarios** que cubren los módulos críticos:

- `auth` — lógica de autenticación y generación de JWT
- `pedido-estado` — transiciones del flujo Kanban
- `insumo` — alertas de stock y CRUD

```bash
# Ejecutar todos los tests
npm run test

# Con reporte de cobertura
npm run test:cov
```

---

## Despliegue

- **Backend**: [Render](https://render.com) — Web Service con Node.js
- **Base de datos**: [Supabase](https://supabase.com) — PostgreSQL gestionado
- **Frontend**: React en [Vercel](https://nueva-tendencia-frontend.vercel.app)

> `synchronize: false` en TypeORM — los cambios de esquema deben aplicarse con `npm run migration:run`.

---

## Autor

**Jhon Carlos Porco Gonzales**
Universidad Adventista de Bolivia (UAB)
Trabajo Dirigido — 2026

---

*Documentación de la API disponible en `/api` (Swagger UI) al ejecutar el servidor.*
