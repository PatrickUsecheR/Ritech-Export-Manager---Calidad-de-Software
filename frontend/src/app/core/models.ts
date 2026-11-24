/** Tipos compartidos de TypeScript para entidades y respuestas de la API Django. */

export type UserRole = 'Admin' | 'Analista' | 'Calidad' | 'Cliente';

export interface User {
  id: number;
  nombre: string;
  email: string;
  rol: UserRole;
}

export interface AuthResponse {
  access: string;
  refresh: string;
  usuario: User;
}

export interface Lot {
  id: number;
  codigo_lote: string;
  tipo_producto: string;
  producto?: number | null;
  proveedor?: number | null;
  peso_kg: string | number;
  calidad: string;
  fecha_cosecha: string;
  estado: string;
}

export interface Client {
  id: number;
  razon_social: string;
  tax_id_vat: string;
  pais_destino: string;
  direccion: string;
  puerto_destino: string;
  email_contacto: string;
}

export interface Supplier {
  id: number;
  razon_social: string;
  nit: string;
  contacto: string;
  email: string;
  telefono: string;
  direccion: string;
  municipio_origen: string;
}

export interface Product {
  id: number;
  nombre: string;
  tipo_producto: string;
  descripcion: string;
  precio_unitario_eur: string | number;
  activo: string;
}

export interface RolePermission {
  id: number;
  rol: UserRole;
  recurso: string;
  puede_leer: boolean;
  puede_crear: boolean;
  puede_editar: boolean;
  puede_eliminar: boolean;
}

export interface OrderDetail {
  id?: number;
  lote: number;
  codigo_lote?: string;
  tipo_producto?: string;
  cantidad_kg: string | number;
  precio_unitario_eur: string | number;
  subtotal_eur: string | number;
}

export interface ExportOrder {
  id: number;
  codigo_orden: string;
  cliente: number;
  cliente_nombre?: string;
  fecha_envio: string;
  valor_total_eur: string | number;
  tasa_cambio_cop: string | number;
  valor_total_cop: string | number;
  estado: string;
  detalles: OrderDetail[];
}

export interface ApiList<T> {
  count?: number;
  results?: T[];
}
