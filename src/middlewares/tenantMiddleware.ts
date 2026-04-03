import { Request, Response, NextFunction } from 'express';
import { prisma } from '../database';
import { logError, logWarn } from '../utils/logger';

// Extend Request interface to include tenant
declare global {
  namespace Express {
    interface Request {
      tenant?: {
        id: number;
        nome: string;
        slug: string;
        ativo: boolean;
      };
      tenantId?: number;
    }
  }
}

/**
 * Middleware para validar o tenantId nas requisições
 * Verifica se o tenant existe, está ativo e se o usuário pertence a ele
 */
export const validateTenant = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Obter tenantId do header ou do JWT
    const tenantIdFromHeader = req.headers['x-tenant-id'] as string;
    const tenantIdFromJWT = req.user?.tenantId;

    // Priorizar o header, mas usar o JWT como fallback
    const tenantId = tenantIdFromHeader 
      ? parseInt(tenantIdFromHeader, 10)
      : tenantIdFromJWT 
        ? parseInt(tenantIdFromJWT.toString(), 10)
        : null;

    if (!tenantId || isNaN(tenantId)) {
      logWarn('Tenant validation failed: missing tenantId', {
        path: req.path,
        method: req.method,
        hasHeader: !!tenantIdFromHeader,
        hasJWT: !!tenantIdFromJWT
      });
      return res.status(400).json({ 
        message: 'Tenant ID é obrigatório. Header X-Tenant-Id não fornecido ou inválido.' 
      });
    }

    // Buscar o tenant no banco de dados
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        nome: true,
        slug: true,
        ativo: true,
      }
    });

    if (!tenant) {
      logWarn('Tenant validation failed: tenant not found', {
        tenantId,
        path: req.path,
        method: req.method
      });
      return res.status(404).json({ 
        message: 'Tenant não encontrado.' 
      });
    }

    if (!tenant.ativo) {
      logWarn('Tenant validation failed: tenant is inactive', {
        tenantId,
        path: req.path,
        method: req.method
      });
      return res.status(403).json({ 
        message: 'Tenant está inativo. Entre em contato com o suporte.' 
      });
    }

    // Se houver usuário autenticado, validar se ele pertence ao tenant
    if (req.user?.id) {
      const user = await prisma.usuario.findUnique({
        where: { id: req.user.id },
        select: { id_tenant: true }
      });

      if (!user) {
        logWarn('Tenant validation failed: user not found', {
          userId: req.user.id,
          tenantId,
          path: req.path
        });
        return res.status(404).json({ 
          message: 'Usuário não encontrado.' 
        });
      }

      if (user.id_tenant !== tenantId) {
        logWarn('Tenant validation failed: user does not belong to tenant', {
          userId: req.user.id,
          userTenantId: user.id_tenant,
          requestedTenantId: tenantId,
          path: req.path
        });
        return res.status(403).json({ 
          message: 'Você não tem permissão para acessar este tenant.' 
        });
      }
    }

    // Adicionar informações do tenant na requisição
    req.tenant = tenant;
    req.tenantId = tenant.id;

    next();
  } catch (error) {
    logError('Error validating tenant', error, {
      path: req.path,
      method: req.method
    });
    return res.status(500).json({ 
      message: 'Erro ao validar tenant.' 
    });
  }
};

/**
 * Middleware opcional que permite requisições sem tenant (para rotas públicas)
 * Mas valida o tenant se ele for fornecido
 */
export const optionalValidateTenant = async (req: Request, res: Response, next: NextFunction) => {
  const tenantIdFromHeader = req.headers['x-tenant-id'] as string;
  const tenantIdFromJWT = req.user?.tenantId;

  const tenantId = tenantIdFromHeader 
    ? parseInt(tenantIdFromHeader, 10)
    : tenantIdFromJWT 
      ? parseInt(tenantIdFromJWT.toString(), 10)
      : null;

  // Se não houver tenantId, apenas continua (rota pública)
  if (!tenantId || isNaN(tenantId)) {
    return next();
  }

  // Se houver tenantId, valida normalmente
  return validateTenant(req, res, next);
};
