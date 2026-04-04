import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { EquipamentoLogService } from './equipamentoLogService';
import { prisma } from '../database';
import { logError } from '../utils/logger';
import type { EquipamentoMetrica } from '../types/EquipamentoMetrica';

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
   * Gera relatório em formato PDF
   */
  async generatePDFReport(
    id_equipamento: number,
    startDate: Date,
    endDate: Date
  ): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
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

        const metrics = tableData.metrics;
        const rows = tableData.rows;

        // Criar documento PDF
        const doc = new PDFDocument({ margin: 50 });
        const chunks: Buffer[] = [];

        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Cabeçalho
        doc.fontSize(20).text('Relatório de Logs de Equipamento', { align: 'center' });
        doc.moveDown();

        // Informações do equipamento
        doc.fontSize(12);
        doc.text(`Equipamento: ${equipamento.nome}`);
        doc.text(`Cliente: ${equipamento.cliente?.nome || 'N/A'}`);
        doc.text(`Período: ${startDate.toLocaleDateString('pt-BR')} até ${endDate.toLocaleDateString('pt-BR')}`);
        doc.text(`Total de registros: ${rows.length}`);
        doc.moveDown();

        // Tabela de dados
        const tableTop = doc.y;
        const itemHeight = 20;
        const pageHeight = doc.page.height - 100;

        // Cabeçalho da tabela
        doc.fontSize(10).font('Helvetica-Bold');
        let x = 50;
        doc.text('Timestamp', x, tableTop);
        x += 120;

        metrics.forEach((metric: EquipamentoMetrica) => {
          if (metric.metrica) {
            const text = `${metric.metrica.nome} (${metric.metrica.unidade})`;
            const textWidth = doc.widthOfString(text);
            if (x + textWidth > doc.page.width - 50) {
              doc.addPage();
              x = 50;
            }
            doc.text(text, x, tableTop);
            x += 100;
          }
        });

        // Linha separadora
        doc.moveTo(50, tableTop + 15).lineTo(doc.page.width - 50, tableTop + 15).stroke();

        // Dados
        doc.font('Helvetica');
        let y = tableTop + 25;

        rows.forEach((row: any) => {
          if (y > pageHeight) {
            doc.addPage();
            y = 50;
          }

          x = 50;
          // Formatar timestamp como string legível sem criar Date object
          let timestamp = 'N/A';
          if (row.timestamp) {
            if (typeof row.timestamp === 'string') {
              timestamp = row.timestamp.replace('T', ' ').replace('Z', '').replace(/\.\d{3}$/, '');
            } else if (row.timestamp instanceof Date) {
              timestamp = row.timestamp.toISOString().replace('T', ' ').replace('Z', '').replace(/\.\d{3}$/, '');
            } else {
              timestamp = String(row.timestamp);
            }
          }
          doc.text(timestamp, x, y);
          x += 120;

          // Adicionar valores das métricas
          metrics.forEach((metric: EquipamentoMetrica) => {
            const value = row[`metrica_${metric.id_metrica}`] !== null && row[`metrica_${metric.id_metrica}`] !== undefined
              ? Number(row[`metrica_${metric.id_metrica}`]).toFixed(2)
              : 'N/A';
            doc.text(value, x, y);
            x += 100;
          });

          y += itemHeight;
        });

        doc.end();
      } catch (error) {
        logError('Failed to generate PDF report', error);
        reject(error);
      }
    });
  }
}

