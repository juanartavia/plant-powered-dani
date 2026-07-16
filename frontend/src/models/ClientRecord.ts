export type TipoId = "cedula" | "pasaporte" | "licencia" | "otro";

export interface ClientRecord {
  correo: string;
  nombre: string;
  apellido: string;
  telefono: string;
  tipoId: TipoId | "";
  numeroId: string;
  fecha_nacimiento: string;
  idioma: string;
}
