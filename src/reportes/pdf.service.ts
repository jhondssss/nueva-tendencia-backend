import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Pedido } from '../pedido/entities/pedido.entity';
import { Producto } from '../producto/entities/producto.entity';
import { Insumo } from '../insumo/entities/insumo.entity';
import { IReportePDF, ResumenDiario } from './interfaces/reporte.interface';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit');
import { condicionStockCritico } from '../common/stock-critico';

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
    @InjectRepository(Insumo)   private insumoRepo:   Repository<Insumo>,
  ) {}

  // ══════════════════════════════════════════════════════════════════════════
  // Helpers privados reutilizables
  // ══════════════════════════════════════════════════════════════════════════

  private buildDoc(): { doc: any; finish: Promise<Buffer> } {
    const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const finish = new Promise<Buffer>(resolve =>
      doc.on('end', () => resolve(Buffer.concat(chunks))),
    );
    return { doc, finish };
  }

  private buildHeader(doc: any, title: string, generadoPor?: string): void {
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
    doc
      .fillColor('#888888').fontSize(9).font('Helvetica')
      .text(`Generado por: ${generadoPor ?? '—'}`, { align: 'right' });

    doc.moveDown(0.4);
    const lineY = doc.y;
    doc.moveTo(50, lineY).lineTo(545, lineY)
      .strokeColor(CAFE).lineWidth(2).stroke();
    doc.moveDown(1.2);
  }

  /** Escribe "Página X de Y" al pie de cada página ya generada.
   * Requiere bufferPages:true en buildDoc para poder volver a páginas previas. */
  private addPageNumbers(doc: any): void {
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      const { height, width } = doc.page;
      const bottomMargin = doc.page.margins.bottom;
      doc.page.margins.bottom = 0; // evita que pdfkit agregue una página en blanco
      doc
        .fillColor('#888888').fontSize(8).font('Helvetica')
        .text(`Página ${i + 1} de ${range.count}`, 50, height - 35, {
          width: width - 100,
          align: 'center',
        });
      doc.page.margins.bottom = bottomMargin;
    }
  }

  private fmtMonto(n: number): string {
    return `Bs. ${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  private buildTable(
    doc: any,
    y: number,
    labels: string[],
    widths: number[],
  ): number {
    const H = 20;
    const totalW = widths.reduce((a, b) => a + b, 0);
    doc.rect(50, y, totalW, H).fill(CAFE);

    let x = 50;
    for (let i = 0; i < labels.length; i++) {
      doc
        .fillColor('white').fontSize(7.5).font('Helvetica-Bold')
        .text(labels[i], x + 4, y + 6, {
          width: widths[i] - 6,
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
    const H = 18;
    const totalW = widths.reduce((a, b) => a + b, 0);

    if (redBg)    doc.rect(50, y, totalW, H).fill('#FFDEDE');
    else if (alt) doc.rect(50, y, totalW, H).fill(CAFE_ALT);

    doc.rect(50, y, totalW, H).strokeColor('#D0D0D0').lineWidth(0.5).stroke();

    let x = 50;
    for (let i = 0; i < cells.length; i++) {
      doc
        .fillColor(redBg ? '#8B0000' : '#222222').fontSize(7).font('Helvetica')
        .text(String(cells[i]), x + 4, y + 5, {
          width: widths[i] - 6,
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

  private maybePageBreak(
    doc: any,
    y: number,
    needed = 28,
    headers?: { labels: string[]; widths: number[] },
  ): number {
    if (y + needed > (doc.page.height as number) - 60) {
      doc.addPage();
      return headers ? this.buildTable(doc, 50, headers.labels, headers.widths) : 50;
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

  async generarPDFVentas(year: number, usuario?: string): Promise<Buffer> {
    const pedidos = await this.pedidoRepo.find({
      where: { estado: 'Terminado', fecha_entrega: Between(`${year}-01-01`, `${year}-12-31`) as any },
    });

    const totalesMes = Array<number>(12).fill(0);
    for (const p of pedidos) {
      const s = (p.fecha_entrega ? new Date(p.fecha_entrega) : new Date()).toISOString().slice(0, 10);
      const mesIdx = parseInt(s.split('-')[1], 10) - 1;
      totalesMes[mesIdx] += Number(p.total);
    }
    const grandTotal = totalesMes.reduce((a, b) => a + b, 0);

    const { doc, finish } = this.buildDoc();
    this.buildHeader(doc, `Reporte de Ventas por Mes — ${year}`, usuario);

    const widths = [170, 163, 162];
    const aligns: ('left' | 'right' | 'center')[] = ['left', 'right', 'right'];
    let y = this.buildTable(doc, doc.y, ['Mes', 'Ventas (Bs.)', '% del Total'], widths);

    const ventasHeaders = { labels: ['Mes', 'Ventas (Bs.)', '% del Total'], widths };
    MESES.forEach((mes, i) => {
      y = this.maybePageBreak(doc, y, 28, ventasHeaders);
      y = this.drawDataRow(doc, y, [
        mes,
        this.fmtMonto(totalesMes[i]),
        grandTotal > 0 ? `${((totalesMes[i] / grandTotal) * 100).toFixed(1)} %` : '—',
      ], widths, aligns, i % 2 === 1);
    });

    y = this.maybePageBreak(doc, y, 28, ventasHeaders);
    this.buildFooter(doc, y, ['TOTAL', this.fmtMonto(grandTotal), '100 %'], widths);

    this.addPageNumbers(doc);
    doc.end();
    return finish;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // b) PDF — Pedidos
  // ══════════════════════════════════════════════════════════════════════════

  async generarPDFPedidos(usuario?: string): Promise<Buffer> {
    const pedidos = await this.pedidoRepo.find({
      relations: ['cliente', 'producto'],
      order: { id_pedido: 'ASC' },
    });

    const { doc, finish } = this.buildDoc();
    this.buildHeader(doc, 'Reporte de Pedidos', usuario);

    doc.fillColor(CAFE).fontSize(10).font('Helvetica-Bold').text('Resumen por Estado');
    doc.moveDown(0.3);

    const sWidths = [170, 163, 162];
    let y = this.buildTable(doc, doc.y, ['Estado', 'Cantidad', '% del Total'], sWidths);

    const estadosHeaders = { labels: ['Estado', 'Cantidad', '% del Total'], widths: sWidths };
    ESTADOS_PEDIDO.forEach((estado, i) => {
      const cant = pedidos.filter(p => p.estado === estado).length;
      y = this.maybePageBreak(doc, y, 28, estadosHeaders);
      y = this.drawDataRow(doc, y, [
        estado,
        String(cant),
        pedidos.length > 0 ? `${((cant / pedidos.length) * 100).toFixed(1)} %` : '—',
      ], sWidths, ['left', 'right', 'right'], i % 2 === 1);
    });

    doc.moveDown(2);

    doc.fillColor(CAFE).fontSize(10).font('Helvetica-Bold').text('Detalle de Pedidos');
    doc.moveDown(0.3);

    const dWidths = [28, 72, 48, 75, 55, 40, 42, 35, 55, 45];
    const dAligns: ('left' | 'right' | 'center')[] =
      ['center', 'left', 'center', 'left', 'center', 'right', 'right', 'right', 'center', 'right'];

    y = this.buildTable(doc, doc.y,
      ['#ID', 'Cliente', 'ID Cliente', 'Producto', 'Estado', 'Cant.', 'Unidad', 'Pares', 'Fecha Entrega', 'Total Bs.'],
      dWidths,
    );

    const detalleHeaders = {
      labels: ['#ID', 'Cliente', 'ID Cliente', 'Producto', 'Estado', 'Cant.', 'Unidad', 'Pares', 'Fecha Entrega', 'Total Bs.'],
      widths: dWidths,
    };
    let sumaPares = 0;
    let sumaTotal = 0;
    pedidos.forEach((p, i) => {
      y = this.maybePageBreak(doc, y, 28, detalleHeaders);
      sumaPares += p.cantidad_pares ?? 0;
      sumaTotal += Number(p.total);
      y = this.drawDataRow(doc, y, [
        p.id_pedido,
        p.cliente?.nombre ?? '—',
        p.cliente?.id_cliente ?? '—',
        p.producto?.nombre_modelo ?? '—',
        p.estado,
        p.cantidad ?? 1,
        p.unidad ?? 'docena',
        p.cantidad_pares ?? 0,
        p.fecha_entrega ? this.fmtDate(p.fecha_entrega) : '—',
        this.fmtMonto(Number(p.total)),
      ], dWidths, dAligns, i % 2 === 1);
    });

    y = this.maybePageBreak(doc, y, 28, detalleHeaders);
    this.buildFooter(doc, y, [
      '', 'TOTAL GENERAL', '', '', '', '', '',
      String(sumaPares),
      '',
      this.fmtMonto(sumaTotal),
    ], dWidths);

    this.addPageNumbers(doc);
    doc.end();
    return finish;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // c) PDF — Stock Crítico
  // ══════════════════════════════════════════════════════════════════════════

  async generarPDFStock(usuario?: string): Promise<Buffer> {
    const criticos = await this.productoRepo
      .createQueryBuilder('p')
      .where(condicionStockCritico('p'))
      .getMany();

    const insumoCriticos = await this.insumoRepo
      .createQueryBuilder('i')
      .where(condicionStockCritico('i'))
      .andWhere('i.activo = :activo', { activo: true })
      .getMany();

    const inversionEstimada = criticos.reduce((sum, p) => {
      const cantSugerida = Math.max(0, p.nivel_minimo - p.stock);
      return sum + cantSugerida * Number(p.costo_unidad);
    }, 0);

    const { doc, finish } = this.buildDoc();
    this.buildHeader(doc, 'Reporte de Stock Crítico', usuario);

    // ── Resumen ejecutivo ─────────────────────────────────────────────────
    const rWidths = [330, 165];
    let y = this.buildTable(doc, doc.y, ['Resumen Ejecutivo', 'Valor'], rWidths);
    const resumenItems: [string, string][] = [
      ['Total productos críticos',                      String(criticos.length)],
      ['Total insumos críticos',                        String(insumoCriticos.length)],
      ['Inversión estimada (reposición de productos)',  this.fmtMonto(inversionEstimada)],
    ];
    const resumenHeaders = { labels: ['Resumen Ejecutivo', 'Valor'], widths: rWidths };
    resumenItems.forEach(([label, val], i) => {
      y = this.maybePageBreak(doc, y, 28, resumenHeaders);
      y = this.drawDataRow(doc, y, [label, val], rWidths, ['left', 'right'], i % 2 === 1);
    });
    doc.moveDown(1.2);

    // ── Sección productos ─────────────────────────────────────────────────
    doc.fillColor(CAFE).fontSize(10).font('Helvetica-Bold').text('Productos con Stock Crítico');
    doc.moveDown(0.3);
    doc
      .fillColor('#CC0000').fontSize(9).font('Helvetica')
      .text(`${criticos.length} producto(s) con stock igual o por debajo del nivel mínimo.`);
    doc.moveDown(0.5);

    const pWidths = [130, 60, 60, 60, 55, 65, 65];
    const pAligns: ('left' | 'right' | 'center')[] = ['left', 'left', 'right', 'right', 'right', 'right', 'right'];
    y = this.buildTable(doc, doc.y,
      ['Producto', 'Marca', 'Stock Actual', 'Nivel Mínimo', 'Diferencia', 'Precio Venta', 'Cant. Sugerida'],
      pWidths,
    );

    if (criticos.length === 0) {
      doc.moveDown(0.5).fillColor('#007700').fontSize(10).font('Helvetica')
        .text('Sin productos críticos.', { align: 'center' });
      y = doc.y;
    } else {
      const productosHeaders = {
        labels: ['Producto', 'Marca', 'Stock Actual', 'Nivel Mínimo', 'Diferencia', 'Precio Venta', 'Cant. Sugerida'],
        widths: pWidths,
      };
      criticos.forEach((p, i) => {
        y = this.maybePageBreak(doc, y, 28, productosHeaders);
        const cantSugerida = Math.max(0, p.nivel_minimo - p.stock);
        y = this.drawDataRow(doc, y, [
          p.nombre_modelo,
          p.marca,
          String(p.stock),
          String(p.nivel_minimo),
          String(p.stock - p.nivel_minimo),
          this.fmtMonto(Number(p.precio_venta)),
          String(cantSugerida),
        ], pWidths, pAligns, i % 2 === 1, true);
      });
    }

    doc.moveDown(1.2);

    // ── Sección insumos ───────────────────────────────────────────────────
    y = doc.y;
    y = this.maybePageBreak(doc, y, 60);
    doc.y = y;
    doc.fillColor(CAFE).fontSize(10).font('Helvetica-Bold').text('Insumos con Stock Crítico');
    doc.moveDown(0.3);
    doc
      .fillColor('#CC0000').fontSize(9).font('Helvetica')
      .text(`${insumoCriticos.length} insumo(s) con stock igual o por debajo del nivel mínimo.`);
    doc.moveDown(0.5);

    const iWidths = [135, 65, 60, 60, 55, 65, 55];
    const iAligns: ('left' | 'right' | 'center')[] = ['left', 'left', 'right', 'right', 'right', 'right', 'right'];
    y = this.buildTable(doc, doc.y,
      ['Insumo', 'Categoría', 'Stock Actual', 'Nivel Mínimo', 'Diferencia', 'Precio Unitario', 'Cant. Sugerida'],
      iWidths,
    );

    if (insumoCriticos.length === 0) {
      doc.moveDown(0.5).fillColor('#007700').fontSize(10).font('Helvetica')
        .text('Sin insumos críticos.', { align: 'center' });
    } else {
      const insumosHeaders = {
        labels: ['Insumo', 'Categoría', 'Stock Actual', 'Nivel Mínimo', 'Diferencia', 'Precio Unitario', 'Cant. Sugerida'],
        widths: iWidths,
      };
      insumoCriticos.forEach((ins, i) => {
        y = this.maybePageBreak(doc, y, 28, insumosHeaders);
        const cantSugerida = Math.max(0, Number(ins.nivel_minimo) - Number(ins.stock));
        y = this.drawDataRow(doc, y, [
          ins.nombre,
          ins.categoria,
          Number(ins.stock).toFixed(2),
          Number(ins.nivel_minimo).toFixed(2),
          (Number(ins.stock) - Number(ins.nivel_minimo)).toFixed(2),
          this.fmtMonto(Number(ins.precio_unitario)),
          cantSugerida.toFixed(2),
        ], iWidths, iAligns, i % 2 === 1, true);
      });
    }

    this.addPageNumbers(doc);
    doc.end();
    return finish;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // d) PDF — Pedidos Entregados
  // ══════════════════════════════════════════════════════════════════════════

  async generarPDFPedidosEntregados(usuario?: string): Promise<Buffer> {
    const pedidos = await this.pedidoRepo.find({
      where: { estado: 'Terminado' },
      relations: ['cliente', 'producto'],
      order: { id_pedido: 'ASC' },
    });

    const { doc, finish } = this.buildDoc();
    this.buildHeader(doc, 'Reporte de Pedidos Entregados', usuario);

    const widths = [28, 72, 55, 75, 50, 38, 42, 35, 55, 45];
    const aligns: ('left' | 'right' | 'center')[] =
      ['center', 'left', 'center', 'left', 'center', 'right', 'center', 'right', 'right', 'center'];

    let y = this.buildTable(doc, doc.y, [
      'ID', 'Cliente', 'ID Cliente', 'Producto', 'Categoría',
      'Cantidad', 'Unidad', 'Pares', 'Total Bs.', 'F. Entrega',
    ], widths);

    const entregadosHeaders = {
      labels: ['ID', 'Cliente', 'ID Cliente', 'Producto', 'Categoría', 'Cantidad', 'Unidad', 'Pares', 'Total Bs.', 'F. Entrega'],
      widths,
    };
    let sumaTotal = 0;
    const catMap: Record<string, string> = { nino: 'Niño', juvenil: 'Juvenil', adulto: 'Adulto' };
    pedidos.forEach((p, i) => {
      y = this.maybePageBreak(doc, y, 28, entregadosHeaders);
      sumaTotal += Number(p.total);
      y = this.drawDataRow(doc, y, [
        p.id_pedido,
        p.cliente?.nombre ?? '—',
        p.cliente?.id_cliente ?? '—',
        p.producto?.nombre_modelo ?? '—',
        p.categoria ? catMap[p.categoria] : '—',
        p.cantidad ?? 1,
        p.unidad ?? 'docena',
        p.cantidad_pares ?? 0,
        this.fmtMonto(Number(p.total)),
        this.fmtDate(p.fecha_entrega),
      ], widths, aligns, i % 2 === 1);
    });

    y = this.maybePageBreak(doc, y, 28, entregadosHeaders);
    const totalW = widths.reduce((a, b) => a + b, 0);
    this.buildFooter(doc, y, [
      'TOTAL', '', '', '', '', '', '', '', this.fmtMonto(sumaTotal), '',
    ], widths);

    doc.moveDown(1.5);
    doc
      .fillColor(CAFE).fontSize(9).font('Helvetica-Bold')
      .text(`Total pedidos entregados: ${pedidos.length}   |   Total ${this.fmtMonto(sumaTotal)}`, {
        align: 'right',
        width: totalW,
        indent: 50,
      });

    this.addPageNumbers(doc);
    doc.end();
    return finish;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // e) PDF — Ganancias Mensuales
  // ══════════════════════════════════════════════════════════════════════════

  async generarPDFGanancias(month: number, year: number, usuario?: string): Promise<Buffer> {
    const mm = String(month).padStart(2, '0');
    const lastDay = new Date(year, month, 0).getDate();
    const pedidos = await this.pedidoRepo.find({
      where: {
        estado: 'Terminado',
        fecha_entrega: Between(`${year}-${mm}-01`, `${year}-${mm}-${lastDay}`) as any,
      },
      relations: ['cliente', 'producto'],
      order: { id_pedido: 'ASC' },
    });

    const mesNombre = MESES[month - 1] ?? String(month);
    const { doc, finish } = this.buildDoc();
    this.buildHeader(doc, `Reporte de Ganancias — ${mesNombre} ${year}`, usuario);

    const widths = [45, 100, 50, 115, 50, 75, 60];
    const aligns: ('left' | 'right' | 'center')[] = ['center', 'left', 'center', 'left', 'right', 'right', 'center'];

    let y = this.buildTable(doc, doc.y, [
      'N°', 'Cliente', 'ID Cli.', 'Producto', 'Cantidad', 'Total Bs.', 'F. Entrega',
    ], widths);

    const gananciasHeaders = {
      labels: ['N°', 'Cliente', 'ID Cli.', 'Producto', 'Cantidad', 'Total Bs.', 'F. Entrega'],
      widths,
    };
    let sumaTotal = 0;
    let sumaPares = 0;
    pedidos.forEach((p, i) => {
      y = this.maybePageBreak(doc, y, 28, gananciasHeaders);
      sumaTotal += Number(p.total);
      sumaPares += p.cantidad_pares ?? 0;
      const fechaEntrega = p.fecha_entrega
        ? p.fecha_entrega.split('-').reverse().join('/')
        : '—';
      y = this.drawDataRow(doc, y, [
        p.id_pedido,
        p.cliente?.nombre ?? '—',
        p.cliente?.id_cliente ?? '—',
        p.producto?.nombre_modelo ?? '—',
        p.cantidad ?? 1,
        this.fmtMonto(Number(p.total)),
        fechaEntrega,
      ], widths, aligns, i % 2 === 1);
    });

    y = this.maybePageBreak(doc, y, 28, gananciasHeaders);
    y = this.buildFooter(doc, y, [
      'TOTAL', '', '', '',
      String(pedidos.reduce((a, p) => a + (p.cantidad ?? 1), 0)),
      this.fmtMonto(sumaTotal),
      '',
    ], widths);

    const promedio = pedidos.length > 0 ? sumaTotal / pedidos.length : 0;
    doc.moveDown(1.5);
    const summaryLines = [
      `Total pedidos entregados: ${pedidos.length}`,
      `Total pares producidos:   ${sumaPares}`,
      `Total ganancias:          ${this.fmtMonto(sumaTotal)}`,
      `Promedio por pedido:      ${this.fmtMonto(promedio)}`,
    ];
    doc.fillColor(CAFE).fontSize(10).font('Helvetica-Bold').text('Resumen del mes');
    doc.moveDown(0.3);
    summaryLines.forEach(line => {
      doc.fillColor('#333333').fontSize(9).font('Helvetica')
         .text(line, 50, doc.y, { width: 495 });
    });

    this.addPageNumbers(doc);
    doc.end();
    return finish;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // f) PDF — Reporte Diario
  // ══════════════════════════════════════════════════════════════════════════

  async generarPDFDiario(data: ResumenDiario, usuario?: string): Promise<Buffer> {
    const fechaLabel = this.fmtDate(data.fecha);

    const { doc, finish } = this.buildDoc();
    this.buildHeader(doc, `Reporte Diario — ${fechaLabel}`, usuario);

    // ── Sección 1: Resumen ejecutivo ──────────────────────────────────────
    doc.fillColor(CAFE).fontSize(10).font('Helvetica-Bold').text('1. Resumen Ejecutivo');
    doc.moveDown(0.3);

    const rWidths = [330, 165];
    let y = this.buildTable(doc, doc.y, ['Métrica', 'Valor'], rWidths);

    const metricas: [string, string][] = [
      ['Pedidos creados hoy',          String(data.resumen.totalPedidosCreados)],
      ['Pedidos con movimiento hoy',   String(data.resumen.totalPedidosMovidos)],
      ['Ventas del día (Bs.)',         this.fmtMonto(data.resumen.totalVentasDia)],
      ['Movimientos de Kardex hoy',    String(data.resumen.totalMovimientosKardex)],
      ['Alertas críticas de stock',    String(data.resumen.totalAlertasCriticas)],
    ];

    const metricasHeaders = { labels: ['Métrica', 'Valor'], widths: rWidths };
    metricas.forEach(([label, val], i) => {
      y = this.maybePageBreak(doc, y, 28, metricasHeaders);
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
      const creadosHeaders = {
        labels: ['#ID', 'Cliente', 'Producto', 'Estado', 'Total Bs.', 'F. Creación'],
        widths: pWidths,
      };
      data.pedidosCreados.forEach((p: any, i: number) => {
        y = this.maybePageBreak(doc, y, 28, creadosHeaders);
        y = this.drawDataRow(doc, y, [
          p.id_pedido,
          p.cliente?.nombre ?? '—',
          p.producto?.nombre_modelo ?? '—',
          p.estado,
          this.fmtMonto(Number(p.total)),
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
      const movidosHeaders = {
        labels: ['#ID', 'Cliente', 'Producto', 'Estado', 'Total Bs.', 'F. Actualiz.'],
        widths: pWidths,
      };
      data.pedidosMovidos.forEach((p: any, i: number) => {
        y = this.maybePageBreak(doc, y, 28, movidosHeaders);
        y = this.drawDataRow(doc, y, [
          p.id_pedido,
          p.cliente?.nombre ?? '—',
          p.producto?.nombre_modelo ?? '—',
          p.estado,
          this.fmtMonto(Number(p.total)),
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
      const terminadosHeaders = {
        labels: ['#', 'Cliente', 'Producto', 'Pares', 'Total Bs.', 'F. Entrega'],
        widths: vWidths,
      };
      data.pedidosTerminados.forEach((p: any, i: number) => {
        y = this.maybePageBreak(doc, y, 28, terminadosHeaders);
        y = this.drawDataRow(doc, y, [
          i + 1,
          p.cliente?.nombre ?? '—',
          p.producto?.nombre_modelo ?? '—',
          p.cantidad_pares ?? 0,
          this.fmtMonto(Number(p.total)),
          this.fmtDate(p.fecha_entrega),
        ], vWidths, vAligns, i % 2 === 1);
      });
      y = this.maybePageBreak(doc, y, 28, terminadosHeaders);
      this.buildFooter(doc, y, [
        `Total: ${data.pedidosTerminados.length} pedido(s)`,
        '', '', '',
        this.fmtMonto(data.ventasDia),
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
        y = this.maybePageBreak(doc, y, 28, {
          labels: ['#', 'Producto / Insumo', 'Tipo', 'Cantidad', 'Stock Ant.', 'Stock Nvo.', 'Hora'],
          widths: kWidths,
        });
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
      const alertasStockHeaders = {
        labels: ['Modelo', 'Marca', 'Stock', 'Mínimo', 'Diferencia'],
        widths: aWidths,
      };
      data.alertasStock.forEach((p: any, i: number) => {
        y = this.maybePageBreak(doc, y, 28, alertasStockHeaders);
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
      const alertasInsumosHeaders = {
        labels: ['Insumo', 'Unidad', 'Stock', 'Mínimo', 'Diferencia'],
        widths: iWidths,
      };
      data.alertasInsumos.forEach((ins: any, i: number) => {
        y = this.maybePageBreak(doc, y, 28, alertasInsumosHeaders);
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
      const auditoriaHeaders = {
        labels: ['Usuario', 'Módulo', 'Acción', 'Descripción'],
        widths: auWidths,
      };
      data.accionesAuditoria.forEach((a: any, i: number) => {
        y = this.maybePageBreak(doc, y, 28, auditoriaHeaders);
        y = this.drawDataRow(doc, y, [
          a.usuario?.email ?? '(sistema)',
          a.modulo,
          a.accion,
          a.descripcion,
        ], auWidths, auAligns, i % 2 === 1);
      });
    }

    this.addPageNumbers(doc);
    doc.end();
    return finish;
  }
}
