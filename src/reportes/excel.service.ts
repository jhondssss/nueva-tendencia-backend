import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Pedido } from '../pedido/entities/pedido.entity';
import { Cliente } from '../cliente/entities/cliente.entity';
import { Producto } from '../producto/entities/producto.entity';
import { IReporteExcel, ResumenDiario } from './interfaces/reporte.interface';
import * as ExcelJS from 'exceljs';

// ─── Constants ────────────────────────────────────────────────────────────────
const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const CAFE_ARGB    = 'FF4E3020';  // #4E3020 — encabezado café oscuro
const CREMA_ARGB   = 'FFFDF6EC';  // #FDF6EC — fila alterna
const WHITE_ARGB   = 'FFFFFFFF';  // fila normal
const CRITICO_ARGB = 'FFFFE0E0';  // #FFE0E0 — fila crítica/alerta
const TOTAL_ARGB   = 'FFE8DDD5';  // fila de totales / resumen

const BORDER_THIN = {
  top:    { style: 'thin' as const, color: { argb: 'FFCCCCCC' } },
  bottom: { style: 'thin' as const, color: { argb: 'FFCCCCCC' } },
  left:   { style: 'thin' as const, color: { argb: 'FFCCCCCC' } },
  right:  { style: 'thin' as const, color: { argb: 'FFCCCCCC' } },
};

@Injectable()
export class ExcelService implements IReporteExcel {
  constructor(
    @InjectRepository(Pedido)   private pedidoRepo:   Repository<Pedido>,
    @InjectRepository(Cliente)  private clienteRepo:  Repository<Cliente>,
    @InjectRepository(Producto) private productoRepo: Repository<Producto>,
  ) {}

  // ══════════════════════════════════════════════════════════════════════════
  // Helpers privados reutilizables
  // ══════════════════════════════════════════════════════════════════════════

  /** Encabezado: fondo café oscuro, texto blanco, negrita, centrado, con bordes. */
  private applyHeaderStyle(ws: ExcelJS.Worksheet, colCount: number): void {
    const row = ws.getRow(1);
    row.height = 24;
    for (let c = 1; c <= colCount; c++) {
      const cell = row.getCell(c);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CAFE_ARGB } };
      cell.font = { bold: true, color: { argb: WHITE_ARGB }, size: 11 };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false };
      cell.border = BORDER_THIN;
    }
  }

  /**
   * Aplica a las filas de datos:
   *   - Fondo alterno blanco / crema (#FDF6EC)
   *   - Borde thin en todas las celdas
   *   - Alineación: números a la derecha, texto a la izquierda
   *
   * Llamar ANTES de highlightCriticalRow para que el override funcione.
   */
  private styleDataRows(ws: ExcelJS.Worksheet, startRow: number, endRow: number): void {
    const colCount = ws.columns.length;
    for (let r = startRow; r <= endRow; r++) {
      const row   = ws.getRow(r);
      const isAlt = (r - startRow) % 2 === 1;
      for (let c = 1; c <= colCount; c++) {
        const cell = row.getCell(c);
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: isAlt ? CREMA_ARGB : WHITE_ARGB },
        };
        cell.border = BORDER_THIN;
        cell.alignment = {
          vertical: 'middle',
          horizontal: typeof cell.value === 'number' ? 'right' : 'left',
          wrapText: false,
        };
      }
    }
  }

  /**
   * Sobreescribe el fondo de una fila con rojo claro (#FFE0E0) y texto rojo oscuro.
   * Llamar DESPUÉS de styleDataRows para que el override surta efecto.
   */
  private highlightCriticalRow(ws: ExcelJS.Worksheet, rowNum: number): void {
    const colCount = ws.columns.length;
    const row = ws.getRow(rowNum);
    for (let c = 1; c <= colCount; c++) {
      const cell = row.getCell(c);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CRITICO_ARGB } };
      cell.font = { ...cell.font, color: { argb: 'FF8B0000' } };
    }
  }

  /** Fila de totales / resumen: fondo crema oscuro, negrita, bordes, alineación. */
  private styleTotalRow(ws: ExcelJS.Worksheet, row: ExcelJS.Row): void {
    const colCount = ws.columns.length;
    for (let c = 1; c <= colCount; c++) {
      const cell = row.getCell(c);
      cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL_ARGB } };
      cell.font   = { bold: true };
      cell.border = BORDER_THIN;
      cell.alignment = {
        vertical: 'middle',
        horizontal: typeof cell.value === 'number' ? 'right' : 'left',
        wrapText: false,
      };
    }
  }

  /** Ajusta el ancho de cada columna al contenido más largo (máx. 55). */
  private autoFitColumns(ws: ExcelJS.Worksheet): void {
    ws.columns.forEach(col => {
      if (!col || !col.eachCell) return;
      let maxLen = 8;
      col.eachCell({ includeEmpty: false }, cell => {
        const len = cell.value != null ? String(cell.value).length : 0;
        if (len > maxLen) maxLen = len;
      });
      col.width = Math.min(maxLen + 4, 55);
    });
  }

  private fmtDate(d: string | Date): string {
    const s = d instanceof Date
      ? d.toISOString().slice(0, 10)
      : String(d).slice(0, 10);
    const [yr, mo, dy] = s.split('-');
    return `${dy}/${mo}/${yr}`;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // a) Excel — Pedidos
  // ══════════════════════════════════════════════════════════════════════════

  async exportarExcelPedidos(): Promise<Buffer> {
    const pedidos = await this.pedidoRepo.find({ relations: ['cliente', 'producto'] });

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Pedidos');

    ws.columns = [
      { header: '#ID',           key: 'id',             width: 8  },
      { header: 'Cliente',       key: 'cliente',        width: 26 },
      { header: 'Producto',      key: 'producto',       width: 26 },
      { header: 'Estado',        key: 'estado',         width: 14 },
      { header: 'Cantidad',      key: 'cantidad',       width: 10 },
      { header: 'Unidad',        key: 'unidad',         width: 14 },
      { header: 'Pares',         key: 'cantidad_pares', width: 10 },
      { header: 'Total (Bs.)',   key: 'total',          width: 14 },
      { header: 'Fecha Entrega', key: 'fecha_entrega',  width: 16 },
    ];
    this.applyHeaderStyle(ws, 9);

    pedidos.forEach(p =>
      ws.addRow({
        id:             p.id_pedido,
        cliente:        p.cliente?.nombre ?? '',
        producto:       p.producto?.nombre_modelo ?? '',
        estado:         p.estado,
        cantidad:       p.cantidad ?? 1,
        unidad:         p.unidad ?? 'docena',
        cantidad_pares: p.cantidad_pares ?? 0,
        total:          Number(p.total),
        fecha_entrega:  this.fmtDate(p.fecha_entrega),
      }),
    );

    this.styleDataRows(ws, 2, pedidos.length + 1);
    this.autoFitColumns(ws);

    return wb.xlsx.writeBuffer() as Promise<any>;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // b) Excel — Clientes
  // ══════════════════════════════════════════════════════════════════════════

  async exportarExcelClientes(): Promise<Buffer> {
    const clientes = await this.clienteRepo.find();

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Clientes');

    ws.columns = [
      { header: '#ID',         key: 'id',       width: 8  },
      { header: 'Tipo',        key: 'tipo',     width: 14 },
      { header: 'Nombre',      key: 'nombre',   width: 20 },
      { header: 'Apellido',    key: 'apellido', width: 20 },
      { header: 'Documento',   key: 'doc',      width: 16 },
      { header: 'Correo',      key: 'email',    width: 28 },
      { header: 'Teléfono',    key: 'tel',      width: 16 },
      { header: 'Ciudad',      key: 'ciudad',   width: 18 },
      { header: 'Dirección',   key: 'dir',      width: 30 },
      { header: 'F. Registro', key: 'fecha',    width: 16 },
      { header: 'Activo',      key: 'activo',   width: 10 },
    ];
    this.applyHeaderStyle(ws, 11);

    clientes.forEach(c =>
      ws.addRow({
        id:       c.id_cliente,
        tipo:     c.tipo_cliente,
        nombre:   c.nombre,
        apellido: c.apellido ?? '',
        doc:      c.documento_identidad ?? '',
        email:    c.correo_electronico,
        tel:      c.telefono_principal,
        ciudad:   c.ciudad,
        dir:      `${c.direccion_calle}, ${c.direccion_colonia}`,
        fecha:    c.fecha_registro
          ? new Date(c.fecha_registro).toLocaleDateString('es-BO')
          : '',
        activo: c.activo ? 'Sí' : 'No',
      }),
    );

    this.styleDataRows(ws, 2, clientes.length + 1);
    this.autoFitColumns(ws);

    return wb.xlsx.writeBuffer() as Promise<any>;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // c) Excel — Stock
  // ══════════════════════════════════════════════════════════════════════════

  async exportarExcelStock(): Promise<Buffer> {
    const productos = await this.productoRepo.find();

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Stock');

    ws.columns = [
      { header: '#ID',          key: 'id',     width: 8  },
      { header: 'Modelo',       key: 'modelo', width: 22 },
      { header: 'Marca',        key: 'marca',  width: 16 },
      { header: 'Tipo',         key: 'tipo',   width: 14 },
      { header: 'Color',        key: 'color',  width: 12 },
      { header: 'Precio Venta', key: 'precio', width: 14 },
      { header: 'Costo',        key: 'costo',  width: 12 },
      { header: 'Stock',        key: 'stock',  width: 10 },
      { header: 'Nivel Mínimo', key: 'nivel',  width: 13 },
      { header: 'Unidad',       key: 'unidad', width: 12 },
      { header: 'Activo',       key: 'activo', width: 10 },
    ];
    this.applyHeaderStyle(ws, 11);

    productos.forEach(p =>
      ws.addRow({
        id:     p.id_producto,
        modelo: p.nombre_modelo,
        marca:  p.marca,
        tipo:   p.tipo_calzado,
        color:  p.color,
        precio: Number(p.precio_venta),
        costo:  Number(p.costo_unidad),
        stock:  p.stock,
        nivel:  p.nivel_minimo,
        unidad: p.unidad_medida,
        activo: p.activo ? 'Sí' : 'No',
      }),
    );

    // 1.° estilos base (alternado + bordes + alineación)
    this.styleDataRows(ws, 2, productos.length + 1);

    // 2.° override: fondo rojo para filas críticas
    productos.forEach((p, i) => {
      if (p.stock <= p.nivel_minimo) {
        this.highlightCriticalRow(ws, i + 2);
      }
    });

    this.autoFitColumns(ws);

    return wb.xlsx.writeBuffer() as Promise<any>;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // d) Excel — Pedidos Entregados
  // ══════════════════════════════════════════════════════════════════════════

  async exportarExcelPedidosEntregados(): Promise<Buffer> {
    const pedidos = await this.pedidoRepo.find({
      where: { estado: 'Terminado' },
      relations: ['cliente', 'producto'],
    });

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Pedidos Entregados');

    ws.columns = [
      { header: 'N°',            key: 'n',              width: 6  },
      { header: 'Cliente',       key: 'cliente',        width: 26 },
      { header: 'Producto',      key: 'producto',       width: 26 },
      { header: 'Categoría',     key: 'categoria',      width: 13 },
      { header: 'Cantidad',      key: 'cantidad',       width: 10 },
      { header: 'Unidad',        key: 'unidad',         width: 14 },
      { header: 'Pares',         key: 'cantidad_pares', width: 10 },
      { header: 'Total (Bs.)',   key: 'total',          width: 14 },
      { header: 'Fecha Entrega', key: 'fecha_entrega',  width: 16 },
    ];
    this.applyHeaderStyle(ws, 9);

    const catMap: Record<string, string> = { nino: 'Niño', juvenil: 'Juvenil', adulto: 'Adulto' };
    pedidos.forEach((p, i) =>
      ws.addRow({
        n:              i + 1,
        cliente:        p.cliente?.nombre ?? '',
        producto:       p.producto?.nombre_modelo ?? '',
        categoria:      p.categoria ? catMap[p.categoria] : '—',
        cantidad:       p.cantidad ?? 1,
        unidad:         p.unidad ?? 'docena',
        cantidad_pares: p.cantidad_pares ?? 0,
        total:          Number(p.total),
        fecha_entrega:  this.fmtDate(p.fecha_entrega),
      }),
    );

    this.styleDataRows(ws, 2, pedidos.length + 1);

    const sumaTotal = pedidos.reduce((a, p) => a + Number(p.total), 0);
    const totalRow = ws.addRow({
      n:              '',
      cliente:        `Total pedidos: ${pedidos.length}`,
      producto:       '',
      categoria:      '',
      cantidad:       '',
      unidad:         '',
      cantidad_pares: pedidos.reduce((a, p) => a + (p.cantidad_pares ?? 0), 0),
      total:          sumaTotal,
      fecha_entrega:  '',
    });
    this.styleTotalRow(ws, totalRow);

    this.autoFitColumns(ws);

    return wb.xlsx.writeBuffer() as Promise<any>;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // e) Excel — Ganancias Mensuales
  // ══════════════════════════════════════════════════════════════════════════

  async exportarExcelGanancias(month: number, year: number): Promise<Buffer> {
    const mm = String(month).padStart(2, '0');
    const lastDay = new Date(year, month, 0).getDate();
    const pedidos = await this.pedidoRepo.find({
      where: {
        estado: 'Terminado',
        fecha_entrega: Between(`${year}-${mm}-01`, `${year}-${mm}-${lastDay}`) as any,
      },
      relations: ['cliente', 'producto'],
    });

    const mesNombre = MESES[month - 1] ?? String(month);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(`Ganancias ${mesNombre} ${year}`);

    ws.columns = [
      { header: 'N°',          key: 'n',        width: 6  },
      { header: 'Cliente',     key: 'cliente',  width: 26 },
      { header: 'Producto',    key: 'producto', width: 30 },
      { header: 'Cantidad',    key: 'cantidad', width: 10 },
      { header: 'Total (Bs.)', key: 'total',    width: 16 },
    ];
    this.applyHeaderStyle(ws, 5);

    pedidos.forEach((p, i) =>
      ws.addRow({
        n:        i + 1,
        cliente:  p.cliente?.nombre ?? '',
        producto: p.producto?.nombre_modelo ?? '',
        cantidad: p.cantidad ?? 1,
        total:    Number(p.total),
      }),
    );

    this.styleDataRows(ws, 2, pedidos.length + 1);

    // Fila separadora en blanco
    ws.addRow({});

    const sumaTotal = pedidos.reduce((a, p) => a + Number(p.total), 0);
    const sumaPares = pedidos.reduce((a, p) => a + (p.cantidad_pares ?? 0), 0);
    const promedio  = pedidos.length > 0 ? sumaTotal / pedidos.length : 0;

    const summaryData: [string, number | string][] = [
      ['Total pedidos entregados',  pedidos.length],
      ['Total pares producidos',    sumaPares],
      ['Total ganancias (Bs.)',     sumaTotal],
      ['Promedio por pedido (Bs.)', promedio],
    ];

    summaryData.forEach(([label, value]) => {
      const row = ws.addRow({ n: label, cliente: '', producto: '', cantidad: '', total: value });
      this.styleTotalRow(ws, row);
      if (typeof value === 'number' && (label as string).includes('Bs')) {
        row.getCell(5).numFmt = '#,##0.00';
      }
    });

    this.autoFitColumns(ws);

    return wb.xlsx.writeBuffer() as Promise<any>;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // f) Excel — Reporte Diario
  // ══════════════════════════════════════════════════════════════════════════

  async exportarExcelDiario(data: ResumenDiario): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const [yr, mo, dy] = data.fecha.split('-');
    const fechaLabel   = `${dy}-${mo}-${yr}`;

    // ─── Hoja 1: Resumen ejecutivo ──────────────────────────────────────────
    const wsRes = wb.addWorksheet('Resumen Ejecutivo');
    wsRes.columns = [
      { header: 'Métrica', key: 'metrica', width: 36 },
      { header: 'Valor',   key: 'valor',   width: 20 },
    ];
    this.applyHeaderStyle(wsRes, 2);

    const metricas: [string, string | number][] = [
      ['Fecha del reporte',          data.fecha],
      ['Pedidos creados hoy',        data.resumen.totalPedidosCreados],
      ['Pedidos con movimiento hoy', data.resumen.totalPedidosMovidos],
      ['Ventas del día (Bs.)',       data.resumen.totalVentasDia],
      ['Movimientos de Kardex hoy',  data.resumen.totalMovimientosKardex],
      ['Alertas críticas de stock',  data.resumen.totalAlertasCriticas],
    ];
    metricas.forEach(([m, v]) => wsRes.addRow({ metrica: m, valor: v }));
    this.styleDataRows(wsRes, 2, metricas.length + 1);
    this.autoFitColumns(wsRes);

    // ─── Hoja 2: Pedidos del día ────────────────────────────────────────────
    const wsPed = wb.addWorksheet('Pedidos del Día');
    wsPed.columns = [
      { header: '#ID',         key: 'id',       width: 8  },
      { header: 'Cliente',     key: 'cliente',  width: 26 },
      { header: 'Producto',    key: 'producto', width: 26 },
      { header: 'Estado',      key: 'estado',   width: 14 },
      { header: 'Total (Bs.)', key: 'total',    width: 14 },
      { header: 'Tipo',        key: 'tipo',     width: 12 },
      { header: 'Fecha',       key: 'fecha',    width: 18 },
    ];
    this.applyHeaderStyle(wsPed, 7);

    const addPedidoRows = (pedidos: any[], tipo: string) =>
      pedidos.forEach(p =>
        wsPed.addRow({
          id:       p.id_pedido,
          cliente:  p.cliente?.nombre ?? '',
          producto: p.producto?.nombre_modelo ?? '',
          estado:   p.estado,
          total:    Number(p.total),
          tipo,
          fecha:    tipo === 'Creado'
            ? this.fmtDate(p.fecha_creacion)
            : this.fmtDate(p.fecha_actualizacion),
        }),
      );

    addPedidoRows(data.pedidosCreados, 'Creado');
    addPedidoRows(
      data.pedidosMovidos.filter(
        (m: any) => !data.pedidosCreados.some((c: any) => c.id_pedido === m.id_pedido),
      ),
      'Movido',
    );
    this.styleDataRows(wsPed, 2, wsPed.rowCount);
    this.autoFitColumns(wsPed);

    // ─── Hoja 3: Ventas del día ─────────────────────────────────────────────
    const wsVen = wb.addWorksheet('Ventas del Día');
    wsVen.columns = [
      { header: 'N°',          key: 'n',        width: 6  },
      { header: 'Cliente',     key: 'cliente',  width: 26 },
      { header: 'Producto',    key: 'producto', width: 26 },
      { header: 'Pares',       key: 'pares',    width: 10 },
      { header: 'Total (Bs.)', key: 'total',    width: 14 },
      { header: 'F. Entrega',  key: 'fecha',    width: 16 },
    ];
    this.applyHeaderStyle(wsVen, 6);

    data.pedidosTerminados.forEach((p: any, i: number) =>
      wsVen.addRow({
        n:        i + 1,
        cliente:  p.cliente?.nombre ?? '',
        producto: p.producto?.nombre_modelo ?? '',
        pares:    p.cantidad_pares ?? 0,
        total:    Number(p.total),
        fecha:    this.fmtDate(p.fecha_entrega),
      }),
    );
    this.styleDataRows(wsVen, 2, data.pedidosTerminados.length + 1);

    if (data.pedidosTerminados.length > 0) {
      const totRow = wsVen.addRow({
        n: '', cliente: `Total: ${data.pedidosTerminados.length} pedido(s)`,
        producto: '', pares: '', total: data.ventasDia, fecha: '',
      });
      this.styleTotalRow(wsVen, totRow);
    }
    this.autoFitColumns(wsVen);

    // ─── Hoja 4: Kardex del día ─────────────────────────────────────────────
    const wsKar = wb.addWorksheet('Kardex del Día');
    wsKar.columns = [
      { header: '#',               key: 'n',          width: 6  },
      { header: 'Producto/Insumo', key: 'nombre',     width: 28 },
      { header: 'Tipo Registro',   key: 'tipo_reg',   width: 14 },
      { header: 'Movimiento',      key: 'tipo',       width: 12 },
      { header: 'Cantidad',        key: 'cantidad',   width: 12 },
      { header: 'Stock Anterior',  key: 'stock_ant',  width: 14 },
      { header: 'Stock Nuevo',     key: 'stock_nvo',  width: 12 },
      { header: 'Motivo',          key: 'motivo',     width: 30 },
      { header: 'Hora',            key: 'hora',       width: 10 },
    ];
    this.applyHeaderStyle(wsKar, 9);

    data.movimientosKardex.forEach((m: any, i: number) => {
      const nombre = m.tipo_registro === 'producto'
        ? (m.producto?.nombre_modelo ?? '—')
        : (m.insumo?.nombre ?? '—');
      const hora = m.fecha instanceof Date
        ? m.fecha.toTimeString().slice(0, 5)
        : String(m.fecha).slice(11, 16);
      wsKar.addRow({
        n:         i + 1,
        nombre,
        tipo_reg:  m.tipo_registro,
        tipo:      m.tipo,
        cantidad:  Number(m.cantidad),
        stock_ant: Number(m.stock_anterior),
        stock_nvo: Number(m.stock_nuevo),
        motivo:    m.motivo ?? '',
        hora,
      });
    });
    this.styleDataRows(wsKar, 2, data.movimientosKardex.length + 1);
    this.autoFitColumns(wsKar);

    // ─── Hoja 5: Alertas críticas ───────────────────────────────────────────
    const wsAlt = wb.addWorksheet('Alertas Críticas');
    wsAlt.columns = [
      { header: 'Tipo',       key: 'tipo',   width: 12 },
      { header: 'Nombre',     key: 'nombre', width: 28 },
      { header: 'Stock',      key: 'stock',  width: 12 },
      { header: 'Mínimo',     key: 'minimo', width: 12 },
      { header: 'Diferencia', key: 'dif',    width: 12 },
    ];
    this.applyHeaderStyle(wsAlt, 5);

    data.alertasStock.forEach((p: any) =>
      wsAlt.addRow({
        tipo:   'Producto',
        nombre: p.nombre_modelo,
        stock:  Number(p.stock),
        minimo: Number(p.nivel_minimo),
        dif:    Number(p.stock) - Number(p.nivel_minimo),
      }),
    );
    data.alertasInsumos.forEach((ins: any) =>
      wsAlt.addRow({
        tipo:   'Insumo',
        nombre: ins.nombre,
        stock:  Number(ins.stock),
        minimo: Number(ins.nivel_minimo),
        dif:    Number(ins.stock) - Number(ins.nivel_minimo),
      }),
    );

    const totalAlertRows = data.alertasStock.length + data.alertasInsumos.length;
    // 1.° estilos base (bordes + alineación)
    this.styleDataRows(wsAlt, 2, totalAlertRows + 1);
    // 2.° override: todas las filas son críticas
    for (let r = 2; r <= totalAlertRows + 1; r++) {
      this.highlightCriticalRow(wsAlt, r);
    }
    this.autoFitColumns(wsAlt);

    // ─── Hoja 6: Log de actividad ───────────────────────────────────────────
    const wsLog = wb.addWorksheet('Log de Actividad');
    wsLog.columns = [
      { header: 'Usuario',     key: 'usuario', width: 28 },
      { header: 'Módulo',      key: 'modulo',  width: 18 },
      { header: 'Acción',      key: 'accion',  width: 16 },
      { header: 'Descripción', key: 'desc',    width: 50 },
      { header: 'Hora',        key: 'hora',    width: 10 },
    ];
    this.applyHeaderStyle(wsLog, 5);

    data.accionesAuditoria.forEach((a: any) => {
      const hora = a.fecha instanceof Date
        ? a.fecha.toTimeString().slice(0, 5)
        : String(a.fecha).slice(11, 16);
      wsLog.addRow({
        usuario: a.usuario?.email ?? '(sistema)',
        modulo:  a.modulo,
        accion:  a.accion,
        desc:    a.descripcion,
        hora,
      });
    });
    this.styleDataRows(wsLog, 2, data.accionesAuditoria.length + 1);
    this.autoFitColumns(wsLog);

    wb.creator = 'Calzados Nueva Tendencia';
    wb.created = new Date();

    // suppress unused variable warning
    void fechaLabel;

    return wb.xlsx.writeBuffer() as Promise<any>;
  }
}
