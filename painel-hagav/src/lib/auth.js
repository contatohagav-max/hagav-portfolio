export const ADMIN_ROLES = ['viewer', 'operacao', 'comercial', 'admin'];

const ROLE_LABELS = {
  viewer: 'Viewer',
  operacao: 'Operacao',
  comercial: 'Comercial',
  admin: 'Admin',
};

const ROLE_PERMISSIONS = {
  viewer: {
    readDashboard: true,
    readPipeline: true,
    readLeads: true,
    readOrcamentos: true,
    readClientes: true,
    manageLeads: false,
    manageOrcamentos: false,
    manageClientes: false,
    managePipeline: false,
    manageSettings: false,
    exportData: false,
    generateDocuments: false,
  },
  operacao: {
    readDashboard: true,
    readPipeline: true,
    readLeads: true,
    readOrcamentos: true,
    readClientes: true,
    manageLeads: true,
    manageOrcamentos: true,
    manageClientes: true,
    managePipeline: true,
    manageSettings: false,
    exportData: false,
    generateDocuments: true,
  },
  comercial: {
    readDashboard: true,
    readPipeline: true,
    readLeads: true,
    readOrcamentos: true,
    readClientes: true,
    manageLeads: true,
    manageOrcamentos: true,
    manageClientes: true,
    managePipeline: true,
    manageSettings: false,
    exportData: false,
    generateDocuments: true,
  },
  admin: {
    readDashboard: true,
    readPipeline: true,
    readLeads: true,
    readOrcamentos: true,
    readClientes: true,
    manageLeads: true,
    manageOrcamentos: true,
    manageClientes: true,
    managePipeline: true,
    manageSettings: true,
    exportData: true,
    generateDocuments: true,
  },
};

export function normalizeAdminRole(value, fallback = 'viewer') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z_]+/g, '');
  if (ADMIN_ROLES.includes(normalized)) return normalized;
  return fallback;
}

export function buildPermissionMap(role) {
  const safeRole = normalizeAdminRole(role, 'viewer');
  return { role: safeRole, ...(ROLE_PERMISSIONS[safeRole] || ROLE_PERMISSIONS.viewer) };
}

export function roleLabel(role) {
  const safeRole = normalizeAdminRole(role, 'viewer');
  return ROLE_LABELS[safeRole] || 'Viewer';
}
