import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { EquipamentoLogService } from './equipamentoLogService';
import { prisma } from '../database';
import { logError } from '../utils/logger';
import type { EquipamentoMetrica } from '../types/EquipamentoMetrica';

export const PDF_MAX_METRIC_COLUMNS = 8;

export class ReportService {
  private equipamentoLogService = new EquipamentoLogService();

  /**
   * Gera relatório em formato XLSX
   */
  async generateXLSXReport(
    id_equipamento: number,
    startDate: Date,
    endDate: Date
  ): Promise<Buffer> {
    try {
      // Buscar equipamento
      const equipamento = await prisma.equipamento.findUnique({
        where: { id: id_equipamento },
        include: { cliente: true },
      });

      if (!equipamento) {
        throw new Error('Equipamento não encontrado');
      }

      // Usar getLogsTableData para obter dados formatados
      const tableData = await this.equipamentoLogService.getLogsTableData(
        id_equipamento,
        {},
        startDate,
        endDate
      );

      // Criar workbook
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Logs');

      // Definir colunas baseado nos dados formatados
      const columns: any[] = [
        { header: 'Timestamp', key: 'timestamp', width: 20 },
      ];

      tableData.metrics.forEach((metric: any) => {
        if (metric.metrica) {
          columns.push({
            header: `${metric.metrica.nome} (${metric.metrica.unidade})`,
            key: `metrica_${metric.id_metrica}`,
            width: 20,
          });
        }
      });

      worksheet.columns = columns;

      // Estilizar cabeçalho
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' },
      };

      // Função auxiliar para formatar timestamp como string legível
      const formatTimestamp = (timestamp: any): string => {
        if (!timestamp) return 'N/A';
        
        // Se já for string, formatar diretamente
        if (typeof timestamp === 'string') {
          const dateStr = timestamp.replace('T', ' ').replace('Z', '').replace(/\.\d{3}$/, '');
          return dateStr;
        }
        
        // Se for Date object, converter para ISO string e formatar
        if (timestamp instanceof Date) {
          return timestamp.toISOString().replace('T', ' ').replace('Z', '').replace(/\.\d{3}$/, '');
        }
        
        return String(timestamp);
      };

      // Adicionar dados (já formatados pelo getLogsTableData)
      tableData.rows.forEach((row: any) => {
        const excelRow: any = {
          timestamp: formatTimestamp(row.timestamp)
        };

        // Adicionar valores das métricas
        tableData.metrics.forEach((metric: any) => {
          excelRow[`metrica_${metric.id_metrica}`] = row[`metrica_${metric.id_metrica}`] || null;
        });

        worksheet.addRow(excelRow);
      });

      // Adicionar informações do equipamento
      worksheet.insertRow(1, ['Equipamento:', equipamento.nome]);
      worksheet.insertRow(2, ['Cliente:', equipamento.cliente?.nome || 'N/A']);
      worksheet.insertRow(3, ['Período:', `${startDate.toLocaleDateString('pt-BR')} até ${endDate.toLocaleDateString('pt-BR')}`]);
      worksheet.insertRow(4, ['Total de registros:', tableData.rows.length]);
      worksheet.insertRow(5, []); // Linha em branco

      // Estilizar informações
      for (let i = 1; i <= 4; i++) {
        worksheet.getRow(i).font = { bold: true };
      }

      // Gerar buffer
      const buffer = await workbook.xlsx.writeBuffer();
      return Buffer.from(buffer);
    } catch (error) {
      logError('Failed to generate XLSX report', error);
      throw error;
    }
  }

  /**
   * Gera relatório em formato PDF (paisagem, até 8 colunas de métricas)
   */
  async generatePDFReport(
    id_equipamento: number,
    startDate: Date,
    endDate: Date,
    metricIds?: number[]
  ): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
      try {
        const equipamento = await prisma.equipamento.findUnique({
          where: { id: id_equipamento },
          include: { cliente: true },
        });

        if (!equipamento) {
          throw new Error('Equipamento não encontrado');
        }

        const tableData = await this.equipamentoLogService.getLogsTableData(
          id_equipamento,
          {},
          startDate,
          endDate
        );

        let metrics: EquipamentoMetrica[] = tableData.metrics.filter(
          (metric: EquipamentoMetrica) => metric.metrica
        );

        if (metricIds?.length) {
          const selectedIds = new Set(metricIds);
          metrics = metrics.filter((metric) => selectedIds.has(metric.id_metrica));
        }

        metrics = metrics.slice(0, PDF_MAX_METRIC_COLUMNS);

        if (metrics.length === 0) {
          throw new Error('Nenhuma métrica selecionada para o relatório PDF');
        }

        const rows = tableData.rows;

        const doc = new PDFDocument({
          margin: 40,
          size: 'A4',
          layout: 'landscape',
        });
        const chunks: Buffer[] = [];

        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const leftMargin = 40;
        const rightMargin = 40;
        const pageWidth = doc.page.width;
        const pageHeight = doc.page.height;
        const bottomMargin = 50;
        const usableWidth = pageWidth - leftMargin - rightMargin;
        const timestampWidth = 130;
        const metricWidth = (usableWidth - timestampWidth) / metrics.length;
        const rowHeight = 18;
        const headerHeight = 28;

        const formatTimestamp = (timestamp: any): string => {
          if (!timestamp) return 'N/A';
          if (typeof timestamp === 'string') {
            return timestamp.replace('T', ' ').replace('Z', '').replace(/\.\d{3}$/, '');
          }
          if (timestamp instanceof Date) {
            return timestamp.toISOString().replace('T', ' ').replace('Z', '').replace(/\.\d{3}$/, '');
          }
          return String(timestamp);
        };

        const getMetricCellValue = (row: any, metricId: number): string => {
          const field = `metrica_${metricId}`;
          if (row[`${field}_device_alarme`] && row[`${field}_alarme_texto`]) {
            return String(row[`${field}_alarme_texto`]);
          }
          const value = row[field];
          if (value === null || value === undefined) return 'N/A';
          if (typeof value === 'number') return value.toFixed(2);
          return String(value);
        };

        const truncateText = (text: string, maxWidth: number, fontSize: number): string => {
          doc.fontSize(fontSize);
          if (doc.widthOfString(text) <= maxWidth) return text;
          let truncated = text;
          while (truncated.length > 0 && doc.widthOfString(`${truncated}…`) > maxWidth) {
            truncated = truncated.slice(0, -1);
          }
          return truncated.length > 0 ? `${truncated}…` : text.slice(0, 1);
        };

        const drawTableHeader = (y: number) => {
          doc.fontSize(8).font('Helvetica-Bold');
          doc.text('Timestamp', leftMargin, y, { width: timestampWidth });

          metrics.forEach((metric, index) => {
            const x = leftMargin + timestampWidth + index * metricWidth;
            const headerText = `${metric.metrica!.nome} (${metric.metrica!.unidade})`;
            doc.text(truncateText(headerText, metricWidth - 4, 8), x, y, {
              width: metricWidth - 4,
            });
          });

          doc
            .moveTo(leftMargin, y + headerHeight - 6)
            .lineTo(pageWidth - rightMargin, y + headerHeight - 6)
            .stroke();
        };

        doc.fontSize(20).text('Relatório de Logs de Equipamento', { align: 'center' });
        doc.moveDown();

        doc.fontSize(12).font('Helvetica');
        doc.text(`Equipamento: ${equipamento.nome}`);
        doc.text(`Cliente: ${equipamento.cliente?.nome || 'N/A'}`);
        doc.text(`Período: ${startDate.toLocaleDateString('pt-BR')} até ${endDate.toLocaleDateString('pt-BR')}`);
        doc.text(`Total de registros: ${rows.length}`);
        doc.text(`Colunas: Timestamp + ${metrics.length} métrica(s)`);
        doc.moveDown();

        let y = doc.y;
        drawTableHeader(y);
        y += headerHeight;

        doc.font('Helvetica').fontSize(8);

        rows.forEach((row: any) => {
          if (y + rowHeight > pageHeight - bottomMargin) {
            doc.addPage({ size: 'A4', layout: 'landscape', margin: 40 });
            y = 40;
            drawTableHeader(y);
            y += headerHeight;
            doc.font('Helvetica').fontSize(8);
          }

          doc.text(formatTimestamp(row.timestamp), leftMargin, y, { width: timestampWidth });

          metrics.forEach((metric, index) => {
            const x = leftMargin + timestampWidth + index * metricWidth;
            const value = getMetricCellValue(row, metric.id_metrica);
            doc.text(truncateText(value, metricWidth - 4, 8), x, y, {
              width: metricWidth - 4,
            });
          });

          y += rowHeight;
        });

        doc.end();
      } catch (error) {
        logError('Failed to generate PDF report', error);
        reject(error);
      }
    });
  }
}

