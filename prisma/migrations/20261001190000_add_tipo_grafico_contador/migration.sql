-- Insert: tipo_grafico 'contador' (contador acumulador / totalizador)
INSERT INTO `tipo_grafico` (`id`, `nome`) VALUES (4, 'contador');

-- Update: cards de linha (e sem tipo) passam a ser contador
UPDATE `usuario_equipamento_dashboard`
SET `id_tipo_grafico` = 4
WHERE `id_tipo_grafico` = 3 OR `id_tipo_grafico` IS NULL;

-- Bundles persistidos ainda contêm tipo 3 e dados de linha; são recriados no próximo GET
DELETE FROM `usuario_dashboard_bundle`;
