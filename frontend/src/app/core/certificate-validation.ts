/** Valida certificados en el cliente; la API vuelve a comprobarlos de forma autoritativa. */

export const MAX_CERTIFICATE_SIZE_BYTES = 5 * 1024 * 1024;

export function validateCertificateFile(
  file: Pick<File, 'name' | 'size' | 'type'>,
): string | null {
  if (file.size < 1 || file.size > MAX_CERTIFICATE_SIZE_BYTES) {
    return 'El certificado debe tener un tamaño entre 1 byte y 5 MB.';
  }
  if (
    !file.name.toLowerCase().endsWith('.pdf')
    || (file.type && !['application/pdf', 'application/octet-stream'].includes(file.type))
  ) {
    return 'Selecciona un archivo PDF válido.';
  }
  return null;
}
