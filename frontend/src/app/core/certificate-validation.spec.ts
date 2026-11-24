/** Pruebas unitarias del tamaño, la extensión y el tipo MIME de certificados. */

import { validateCertificateFile, MAX_CERTIFICATE_SIZE_BYTES } from './certificate-validation';

describe('validateCertificateFile', () => {
  it('accepts a PDF up to and including 5 MB', () => {
    expect(validateCertificateFile({
      name: 'origin.pdf',
      size: MAX_CERTIFICATE_SIZE_BYTES,
      type: 'application/pdf',
    })).toBeNull();
  });

  it('rejects files larger than 5 MB', () => {
    expect(validateCertificateFile({
      name: 'origin.pdf',
      size: MAX_CERTIFICATE_SIZE_BYTES + 1,
      type: 'application/pdf',
    })).toContain('5 MB');
  });

  it('rejects non-PDF files', () => {
    expect(validateCertificateFile({
      name: 'origin.txt',
      size: 12,
      type: 'text/plain',
    })).toContain('PDF');
  });
});
