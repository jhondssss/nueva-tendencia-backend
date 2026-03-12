import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Pedido } from '../pedido/entities/pedido.entity';
import { Producto } from '../producto/entities/producto.entity';
import { IReportePDF, ResumenDiario } from './interfaces/reporte.interface';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit');

// ─── Constants ────────────────────────────────────────────────────────────────
const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const ESTADOS_PEDIDO = ['Pendiente', 'Cortado', 'Aparado', 'Solado', 'Empaque', 'Terminado'] as const;

const CAFE     = '#5C3D1E';
const CAFE_ALT = '#F9F4EF';

@Injectable()
export class PdfService implements IReportePDF {
  constructor(
    @InjectRepository(Pedido)   private pedidoRepo:   Repository<Pedido>,
    @InjectRepository(Producto) private productoRepo: Repository<Producto>,
  ) {}

  // ══════════════════════════════════════════════════════════════════════════
  // Helpers privados reutilizables
  // ══════════════════════════════════════════════════════════════════════════

  private buildDoc(): { doc: any; finish: Promise<Buffer> } {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const finish = new Promise<Buffer>(resolve =>
      doc.on('end', () => resolve(Buffer.concat(chunks))),
    );
    return { doc, finish };
  }

  private buildHeader(doc: any, title: string): void {
    doc
      .fillColor(CAFE).fontSize(18).font('Helvetica-Bold')
      .text('Calzados Nueva Tendencia', { align: 'center' });

    doc
      .fillColor('#333333').fontSize(13).font('Helvetica')
      .text(title, { align: 'center' });

    const now = new Date();
    const fecha = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
    doc
      .fillColor('#888888').fontSize(9).font('Helvetica')
      .text(`Generado el: ${fecha}`, { align: 'right' });

    doc.moveDown(0.4);
    const lineY = doc.y;
    doc.moveTo(50, lineY).lineTo(545, lineY)
      .strokeColor(CAFE).lineWidth(2).stroke();
    doc.moveDown(1.2);
  }

  private buildTable(
    doc: any,
    y: number,
    labels: string[],
    widths: number[],
  ): number {
    const H = 24;
    const totalW = widths.reduce((a, b) => a + b, 0);
    doc.rect(50, y, totalW, H).fill(CAFE);

    let x = 50;
    for (let i = 0; i < labels.length; i++) {
      doc
        .fillColor('white').fontSize(8.5).font('Helvetica-Bold')
        .text(labels[i], x + 4, y + 7, {
          width: widths[i] - 8,
          align: 'center',
          lineBreak: false,
        });
      x += widths[i];
    }
    return y + H;
  }

  private drawDataRow(
    doc: any,
    y: number,
    cells: (string | number)[],
    widths: number[],
    aligns: ('left' | 'right' | 'center')[],
    alt: boolean,
    redBg = false,
  ): number {
    const H = 20;
    const totalW = widths.reduce((a, b) => a + b, 0);

    if (redBg)    doc.rect(50, y, totalW, H).fill('#FFDEDE');
    else if (alt) doc.rect(50, y, totalW, H).fill(CAFE_ALT);

    doc.rect(50, y, totalW, H).strokeColor('#D0D0D0').lineWidth(0.5).stroke();

    let x = 50;
    for (let i = 0; i < cells.length; i++) {
      doc
        .fillColor(redBg ? '#8B0000' : '#222222').fontSize(8.5).font('Helvetica')
        .text(String(cells[i]), x + 4, y + 5, {
          width: widths[i] - 8,
          align: aligns[i],
          lineBreak: false,
        });
      x += widths[i];
    }
    return y + H;
  }

  private buildFooter(
    doc: any,
    y: number,
    cells: (string | number)[],
    widths: number[],
  ): number {
    const H = 22;
    const totalW = widths.reduce((a, b) => a + b, 0);
    doc.rect(50, y, totalW, H).fill('#E8DDD5');

    let x = 50;
    for (let i = 0; i < cells.length; i++) {
      doc
        .fillColor('#111111').fontSize(8.5).font('Helvetica-Bold')
        .text(String(cells[i]), x + 4, y + 6, {
          width: widths[i] - 8,
          align: i === 0 ? 'left' : 'right',
          lineBreak: false,
        });
      x += widths[i];
    }
    return y + H;
  }

  private maybePageBreak(doc: any, y: number, needed = 28): number {
    if (y + needed > (doc.page.height as number) - 60) {
      doc.addPage();
      return 50;
    }
    return y;
  }

  private fmtDate(d: string | Date): string {
    const s = d instanceof Date
      ? d.toISOString().slice(0, 10)
      : String(d).slice(0, 10);
    const [yr, mo, dy] = s.split('-');
    return `${dy}/${mo}/${yr}`;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // a) PDF — Ventas por Mes
  // ══════════════════════════════════════════════════════════════════════════

  async generarPDFVentas(year: number): Promise<Buffer> {
    const pedidos = await this.pedidoRepo.find({
      where: { fecha_entrega: Between(`${year}-01-01`, `${year}-12-31`) as any },
    });

    const totalesMes = Array<number>(12).fill(0);
    for (const p of pedidos) {
      const s = (p.fecha_entrega ? new Date(p.fecha_entrega) : new Date()).toISOString().slice(0, 10);
      const mesIdx = parseInt(s.split('-')[1], 10) - 1;
      totalesMes[mesIdx] += Number(p.total);
    }
    const grandTotal = totalesMes.reduce((a, b) => a + b, 0);

    const { doc, finish } = this.buildDoc();
    this.buildHeader(doc, `Reporte de Ventas por Mes — ${year}`);

    const widths = [170, 163, 162];
    const aligns: ('left' | 'right' | 'center')[] = ['left', 'right', 'right'];
    let y = this.buildTable(doc, doc.y, ['Mes', 'Ventas (Bs.)', '% del Total'], widths);

    MESES.forEach((mes, i) => {
      y = this.maybePageBreak(doc, y);
      y = this.drawDataRow(doc, y, [
        mes,
        `Bs. ${totalesMes[i].toFixed(2)}`,
        grandTotal > 0 ? `${((totalesMes[i] / grandTotal) * 100).toFixed(1)} %` : '—',
      ], widths, aligns, i % 2 === 1);
    });

    y = this.maybePageBreak(doc, y);
    this.buildFooter(doc, y, ['TOTAL', `Bs. ${grandTotal.toFixed(2)}`, '100 %'], widths);

    doc.end();
    return finish;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // b) PDF — Pedidos
  // ══════════════════════════════════════════════════════════════════════════

  async generarPDFPedidos(): Promise<Buffer> {
    const pedidos = await this.pedidoRepo.find({ relations: ['cliente', 'producto'] });

    const { doc, finish } = this.buildDoc();
    this.buildHeader(doc, 'Reporte de Pedidos');

    doc.fillColor(CAFE).fontSize(10).font('Helvetica-Bold').text('Resumen por Estado');
    doc.moveDown(0.3);

    const sWidths = [170, 163, 162];
    let y = this.buildTable(doc, doc.y, ['Estado', 'Cantidad', '% del Total'], sWidths);

    ESTADOS_PEDIDO.forEach((estado, i) => {
      const cant = pedidos.filter(p => p.estado === estado).length;
      y = this.maybePageBreak(doc, y);
      y = this.drawDataRow(doc, y, [
        estado,
        String(cant),
        pedidos.length > 0 ? `${((cant / pedidos.length) * 100).toFixed(1)} %` : '—',
      ], sWidths, ['left', 'right', 'right'], i % 2 === 1);
    });

    doc.moveDown(2);

    doc.fillColor(CAFE).fontSize(10).font('Helvetica-Bold').text('Detalle de Pedidos');
    doc.moveDown(0.3);

    const dWidths = [30, 90, 90, 60, 60, 65, 65, 75];
    const dAligns: ('left' | 'right' | 'center')[] =
      ['center', 'left', 'left', 'center', 'right', 'right', 'right', 'center'];

    y = this.buildTable(doc, doc.y,
      ['#ID', 'Cliente', 'Producto', 'Estado', 'Cant.', 'Unidad', 'Pares', 'Total Bs.'],
      dWidths,
    );

    pedidos.forEach((p, i) => {
      y = this.maybePageBreak(doc, y);
      y = this.drawDataRow(doc, y, [
        p.id_pedido,
        p.cliente?.nombre ?? '—',
        p.producto?.nombre_modelo ?? '—',
        p.estado,
        p.cantidad ?? 1,
        p.unidad ?? 'docena',
        p.cantidad_pares ?? 0,
        `Bs. ${Number(p.total).toFixed(2)}`,
      ], dWidths, dAligns, i % 2 === 1);
    });

    doc.end();
    return finish;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // c) PDF — Stock Crítico
  // ══════════════════════════════════════════════════════════════════════════

  async generarPDFStock(): Promise<Buffer> {
    const criticos = await this.productoRepo
      .createQueryBuilder('p')
      .where('p.stock <= p.nivel_minimo')
      .getMany();

    const { doc, finish } = this.buildDoc();
    this.buildHeader(doc, 'Reporte de Stock Crítico');

    doc
      .fillColor('#CC0000').fontSize(9).font('Helvetica')
      .text(`${criticos.length} producto(s) con stock igual o por debajo del nivel mínimo.`);
    doc.moveDown(0.5);

    const widths = [175, 75, 80, 85, 80];
    const aligns: ('left' | 'right' | 'center')[] = ['left', 'left', 'right', 'right', 'right'];
    let y = this.buildTable(doc, doc.y,
      ['Producto', 'Marca', 'Stock Actual', 'Nivel Mínimo', 'Diferencia'],
      widths,
    );

    if (criticos.length === 0) {
      doc.moveDown(0.5).fillColor('#007700').fontSize(10).font('Helvetica')
        .text('Sin productos críticos.', { align: 'center' });
    } else {
      criticos.forEach((p, i) => {
        y = this.maybePageBreak(doc, y);
        y = this.drawDataRow(doc, y, [
          p.nombre_modelo,
          p.marca,
          String(p.stock),
          String(p.nivel_minimo),
          String(p.stock - p.nivel_minimo),
        ], widths, aligns, i % 2 === 1, true);
      });
    }

    doc.end();
    return finish;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // d) PDF — Pedidos Entregados
  // ══════════════════════════════════════════════════════════════════════════

  async generarPDFPedidosEntregados(): Promise<Buffer> {
    const pedidos = await this.pedidoRepo.find({
      where: { estado: 'Terminado' },
      relations: ['cliente', 'producto'],
    });

    const { doc, finish } = this.buildDoc();
    this.buildHeader(doc, 'Reporte de Pedidos Entregados');

    const widths = [25, 80, 85, 55, 45, 50, 40, 60, 55];
    const aligns: ('left' | 'right' | 'center')[] =
      ['center', 'left', 'left', 'center', 'right', 'center', 'right', 'right', 'center'];

    let y = this.buildTable(doc, doc.y, [
      'N°', 'Cliente', 'Producto', 'Categoría',
      'Cantidad', 'Unidad', 'Pares', 'Total Bs.', 'F. Entrega',
    ], widths);

    let sumaTotal = 0;
    pedidos.forEach((p, i) => {
      y = this.maybePageBreak(doc, y);
      sumaTotal += Number(p.total);
      const catMap: Record<string, string> = { nino: 'Niño', juvenil: 'Juvenil', adulto: 'Adulto' };
      y = this.drawDataRow(doc, y, [
        i + 1,
        p.cliente?.nombre ?? '—',
        p.producto?.nombre_modelo ?? '—',
        p.categoria ? catMap[p.categoria] : '—',
        p.cantidad ?? 1,
        p.unidad ?? 'docena',
        p.cantidad_pares ?? 0,
        `Bs. ${Number(p.total).toFixed(2)}`,
        this.fmtDate(p.fecha_entrega),
      ], widths, aligns, i % 2 === 1);
    });

    y = this.maybePageBreak(doc, y);
    const totalW = widths.reduce((a, b) => a + b, 0);
    this.buildFooter(doc, y, [
      `Total pedidos entregados: ${pedidos.length}`,
      '', '', '', '', '', '',
      `Bs. ${sumaTotal.toFixed(2)}`,
      '',
    ], widths);

    doc.moveDown(1.5);
    doc
      .fillColor(CAFE).fontSize(9).font('Helvetica-Bold')
      .text(`Total pedidos entregados: ${pedidos.length}   |   Total Bs.: ${sumaTotal.toFixed(2)}`, {
        align: 'right',
        width: totalW,
        indent: 50,
      });

    doc.end();
    return finish;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // e) PDF — Ganancias Mensuales
  // ══════════════════════════════════════════════════════════════════════════

  async generarPDFGanancias(month: number, year: number): Promise<Buffer> {
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
    const { doc, finish } = this.buildDoc();
    this.buildHeader(doc, `Reporte de Ganancias — ${mesNombre} ${year}`);

    const widths = [30, 130, 175, 70, 90];
    const aligns: ('left' | 'right' | 'center')[] = ['center', 'left', 'left', 'right', 'right'];

    let y = this.buildTable(doc, doc.y, [
      'N°', 'Cliente', 'Producto', 'Cantidad', 'Total Bs.',
    ], widths);

    let sumaTotal = 0;
    let sumaPares = 0;
    pedidos.forEach((p, i) => {
      y = this.maybePageBreak(doc, y);
      sumaTotal += Number(p.total);
      sumaPares += p.cantidad_pares ?? 0;
      y = this.drawDataRow(doc, y, [
        i + 1,
        p.cliente?.nombre ?? '—',
        p.producto?.nombre_modelo ?? '—',
        p.cantidad ?? 1,
        `Bs. ${Number(p.total).toFixed(2)}`,
      ], widths, aligns, i % 2 === 1);
    });

    y = this.maybePageBreak(doc, y);
    y = this.buildFooter(doc, y, [
      'TOTAL', '', '',
      String(pedidos.reduce((a, p) => a + (p.cantidad ?? 1), 0)),
      `Bs. ${sumaTotal.toFixed(2)}`,
    ], widths);

    const promedio = pedidos.length > 0 ? sumaTotal / pedidos.length : 0;
    doc.moveDown(1.5);
    const summaryLines = [
      `Total pedidos entregados: ${pedidos.length}`,
      `Total pares producidos:   ${sumaPares}`,
      `Total ganancias:          Bs. ${sumaTotal.toFixed(2)}`,
      `Promedio por pedido:      Bs. ${promedio.toFixed(2)}`,
    ];
    doc.fillColor(CAFE).fontSize(10).font('Helvetica-Bold').text('Resumen del mes');
    doc.moveDown(0.3);
    summaryLines.forEach(line => {
      doc.fillColor('#333333').fontSize(9.5).font('Helvetica').text(line);
    });

    doc.end();
    return finish;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // f) PDF — Reporte Diario
  // ══════════════════════════════════════════════════════════════════════════

  async generarPDFDiario(data: ResumenDiario): Promise<Buffer> {
    const [dy, mo, yr] = data.fecha.split('-');
    const fechaLabel   = `${dy}/${mo}/${yr}`;

    const { doc, finish } = this.buildDoc();
    this.buildHeader(doc, `Reporte Diario — ${fechaLabel}`);

    // ── Sección 1: Resumen ejecutivo ──────────────────────────────────────
    doc.fillColor(CAFE).fontSize(10).font('Helvetica-Bold').text('1. Resumen Ejecutivo');
    doc.moveDown(0.3);

    const rWidths = [330, 165];
    let y = this.buildTable(doc, doc.y, ['Métrica', 'Valor'], rWidths);

    const metricas: [string, string][] = [
      ['Pedidos creados hoy',          String(data.resumen.totalPedidosCreados)],
      ['Pedidos con movimiento hoy',   String(data.resumen.totalPedidosMovidos)],
      ['Ventas del día (Bs.)',         `Bs. ${data.resumen.totalVentasDia.toFixed(2)}`],
      ['Movimientos de Kardex hoy',    String(data.resumen.totalMovimientosKardex)],
      ['Alertas críticas de stock',    String(data.resumen.totalAlertasCriticas)],
    ];

    metricas.forEach(([label, val], i) => {
      y = this.maybePageBreak(doc, y);
      y = this.drawDataRow(doc, y, [label, val], rWidths, ['left', 'right'], i % 2 === 1);
    });

    doc.moveDown(1.5);

    // ── Sección 2: Pedidos del día ────────────────────────────────────────
    y = doc.y;
    y = this.maybePageBreak(doc, y, 60);
    doc.y = y;
    doc.fillColor(CAFE).fontSize(10).font('Helvetica-Bold').text('2. Pedidos del Día');
    doc.moveDown(0.3);

    const pWidths = [30, 120, 120, 70, 60, 95];
    const pAligns: ('left' | 'right' | 'center')[] = ['center', 'left', 'left', 'center', 'right', 'center'];

    doc.fillColor('#555555').fontSize(8.5).font('Helvetica-Bold').text('Creados:');
    doc.moveDown(0.2);
    y = this.buildTable(doc, doc.y, ['#ID', 'Cliente', 'Producto', 'Estado', 'Total Bs.', 'F. Creación'], pWidths);

    if (data.pedidosCreados.length === 0) {
      doc.moveDown(0.4).fillColor('#888888').fontSize(8.5).text('Sin pedidos creados hoy.', { indent: 8 });
      doc.moveDown(0.4);
      y = doc.y;
    } else {
      data.pedidosCreados.forEach((p: any, i: number) => {
        y = this.maybePageBreak(doc, y);
        y = this.drawDataRow(doc, y, [
          p.id_pedido,
          p.cliente?.nombre ?? '—',
          p.producto?.nombre_modelo ?? '—',
          p.estado,
          `Bs. ${Number(p.total).toFixed(2)}`,
          this.fmtDate(p.fecha_creacion),
        ], pWidths, pAligns, i % 2 === 1);
      });
    }

    doc.moveDown(0.6);
    doc.fillColor('#555555').fontSize(8.5).font('Helvetica-Bold').text('Movidos (actualización de estado):');
    doc.moveDown(0.2);
    y = this.buildTable(doc, doc.y, ['#ID', 'Cliente', 'Producto', 'Estado', 'Total Bs.', 'F. Actualiz.'], pWidths);

    if (data.pedidosMovidos.length === 0) {
      doc.moveDown(0.4).fillColor('#888888').fontSize(8.5).text('Sin pedidos movidos hoy.', { indent: 8 });
      doc.moveDown(0.4);
      y = doc.y;
    } else {
      data.pedidosMovidos.forEach((p: any, i: number) => {
        y = this.maybePageBreak(doc, y);
        y = this.drawDataRow(doc, y, [
          p.id_pedido,
          p.cliente?.nombre ?? '—',
          p.producto?.nombre_modelo ?? '—',
          p.estado,
          `Bs. ${Number(p.total).toFixed(2)}`,
          this.fmtDate(p.fecha_actualizacion),
        ], pWidths, pAligns, i % 2 === 1);
      });
    }

    doc.moveDown(1.5);

    // ── Sección 3: Ventas del día ─────────────────────────────────────────
    y = doc.y;
    y = this.maybePageBreak(doc, y, 60);
    doc.y = y;
    doc.fillColor(CAFE).fontSize(10).font('Helvetica-Bold').text('3. Ventas del Día (Pedidos Terminados)');
    doc.moveDown(0.3);

    const vWidths = [30, 120, 130, 60, 95, 60];
    const vAligns: ('left' | 'right' | 'center')[] = ['center', 'left', 'left', 'right', 'right', 'center'];
    y = this.buildTable(doc, doc.y, ['#', 'Cliente', 'Producto', 'Pares', 'Total Bs.', 'F. Entrega'], vWidths);

    if (data.pedidosTerminados.length === 0) {
      doc.moveDown(0.4).fillColor('#888888').fontSize(8.5).text('Sin ventas registradas hoy.', { indent: 8 });
      doc.moveDown(0.4);
      y = doc.y;
    } else {
      data.pedidosTerminados.forEach((p: any, i: number) => {
        y = this.maybePageBreak(doc, y);
        y = this.drawDataRow(doc, y, [
          i + 1,
          p.cliente?.nombre ?? '—',
          p.producto?.nombre_modelo ?? '—',
          p.cantidad_pares ?? 0,
          `Bs. ${Number(p.total).toFixed(2)}`,
          this.fmtDate(p.fecha_entrega),
        ], vWidths, vAligns, i % 2 === 1);
      });
      y = this.maybePageBreak(doc, y);
      this.buildFooter(doc, y, [
        `Total: ${data.pedidosTerminados.length} pedido(s)`,
        '', '', '',
        `Bs. ${data.ventasDia.toFixed(2)}`,
        '',
      ], vWidths);
    }

    doc.moveDown(1.5);

    // ── Sección 4: Movimientos de Kardex ─────────────────────────────────
    y = doc.y;
    y = this.maybePageBreak(doc, y, 60);
    doc.y = y;
    doc.fillColor(CAFE).fontSize(10).font('Helvetica-Bold').text('4. Movimientos de Kardex del Día');
    doc.moveDown(0.3);

    const kWidths = [30, 130, 60, 60, 65, 65, 85];
    const kAligns: ('left' | 'right' | 'center')[] = ['center', 'left', 'center', 'right', 'right', 'right', 'center'];
    y = this.buildTable(doc, doc.y,
      ['#', 'Producto / Insumo', 'Tipo', 'Cantidad', 'Stock Ant.', 'Stock Nvo.', 'Hora'],
      kWidths,
    );

    if (data.movimientosKardex.length === 0) {
      doc.moveDown(0.4).fillColor('#888888').fontSize(8.5).text('Sin movimientos de Kardex hoy.', { indent: 8 });
      doc.moveDown(0.4);
      y = doc.y;
    } else {
      data.movimientosKardex.forEach((m: any, i: number) => {
        const nombre = m.tipo_registro === 'producto'
          ? (m.producto?.nombre_modelo ?? '—')
          : (m.insumo?.nombre ?? '—');
        const hora = m.fecha instanceof Date
          ? m.fecha.toTimeString().slice(0, 5)
          : String(m.fecha).slice(11, 16);
        y = this.maybePageBreak(doc, y);
        y = this.drawDataRow(doc, y, [
          i + 1,
          nombre,
          m.tipo,
          Number(m.cantidad).toFixed(2),
          Number(m.stock_anterior).toFixed(2),
          Number(m.stock_nuevo).toFixed(2),
          hora,
        ], kWidths, kAligns, i % 2 === 1);
      });
    }

    doc.moveDown(1.5);

    // ── Sección 5: Alertas críticas ───────────────────────────────────────
    y = doc.y;
    y = this.maybePageBreak(doc, y, 60);
    doc.y = y;
    doc.fillColor(CAFE).fontSize(10).font('Helvetica-Bold').text('5. Alertas Críticas de Stock');
    doc.moveDown(0.3);

    const aWidths = [185, 75, 80, 80, 75];
    const aAligns: ('left' | 'right' | 'center')[] = ['left', 'left', 'right', 'right', 'right'];

    doc.fillColor('#555555').fontSize(8.5).font('Helvetica-Bold').text('Productos:');
    doc.moveDown(0.2);
    y = this.buildTable(doc, doc.y, ['Modelo', 'Marca', 'Stock', 'Mínimo', 'Diferencia'], aWidths);

    if (data.alertasStock.length === 0) {
      doc.moveDown(0.4).fillColor('#007700').fontSize(8.5).text('Sin alertas de productos.', { indent: 8 });
      doc.moveDown(0.4);
      y = doc.y;
    } else {
      data.alertasStock.forEach((p: any, i: number) => {
        y = this.maybePageBreak(doc, y);
        y = this.drawDataRow(doc, y, [
          p.nombre_modelo,
          p.marca,
          String(p.stock),
          String(p.nivel_minimo),
          String(p.stock - p.nivel_minimo),
        ], aWidths, aAligns, i % 2 === 1, true);
      });
    }

    doc.moveDown(0.6);
    doc.fillColor('#555555').fontSize(8.5).font('Helvetica-Bold').text('Insumos:');
    doc.moveDown(0.2);
    const iWidths = [200, 80, 80, 80, 55];
    y = this.buildTable(doc, doc.y, ['Insumo', 'Unidad', 'Stock', 'Mínimo', 'Diferencia'], iWidths);

    if (data.alertasInsumos.length === 0) {
      doc.moveDown(0.4).fillColor('#007700').fontSize(8.5).text('Sin alertas de insumos.', { indent: 8 });
      doc.moveDown(0.4);
      y = doc.y;
    } else {
      data.alertasInsumos.forEach((ins: any, i: number) => {
        y = this.maybePageBreak(doc, y);
        y = this.drawDataRow(doc, y, [
          ins.nombre,
          ins.unidad_medida,
          Number(ins.stock).toFixed(2),
          Number(ins.nivel_minimo).toFixed(2),
          (Number(ins.stock) - Number(ins.nivel_minimo)).toFixed(2),
        ], iWidths, ['left', 'center', 'right', 'right', 'right'], i % 2 === 1, true);
      });
    }

    doc.moveDown(1.5);

    // ── Sección 6: Log de actividad (auditoría) ───────────────────────────
    y = doc.y;
    y = this.maybePageBreak(doc, y, 60);
    doc.y = y;
    doc.fillColor(CAFE).fontSize(10).font('Helvetica-Bold').text('6. Log de Actividad (Auditoría)');
    doc.moveDown(0.3);

    const auWidths = [110, 75, 70, 240];
    const auAligns: ('left' | 'right' | 'center')[] = ['left', 'center', 'center', 'left'];
    y = this.buildTable(doc, doc.y, ['Usuario', 'Módulo', 'Acción', 'Descripción'], auWidths);

    if (data.accionesAuditoria.length === 0) {
      doc.moveDown(0.4).fillColor('#888888').fontSize(8.5).text('Sin actividad registrada hoy.', { indent: 8 });
    } else {
      data.accionesAuditoria.forEach((a: any, i: number) => {
        y = this.maybePageBreak(doc, y);
        y = this.drawDataRow(doc, y, [
          a.usuario?.email ?? '(sistema)',
          a.modulo,
          a.accion,
          a.descripcion,
        ], auWidths, auAligns, i % 2 === 1);
      });
    }

    doc.end();
    return finish;
  }
}
