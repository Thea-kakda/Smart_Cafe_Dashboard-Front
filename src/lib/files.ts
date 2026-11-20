/**
 * Thin typed client for the object-storage File API (/api/v1/files/**).
 *
 * The browser never chooses a bucket, a prefix or an object key: it POSTs a
 * multipart {@code file} part to a fixed category endpoint, and the backend
 * returns the server-generated {@code objectKey} plus a short-lived presigned
 * {@code url} for immediate preview. That {@code objectKey} — never the URL —
 * is what gets persisted on a product/category. {@code api.post} detects the
 * FormData body and lets the browser set the multipart boundary.
 */
import { api } from './api';

export interface FileUploadResponse {
  objectKey: string;
  originalFilename: string;
  contentType: string;
  size: number;
  url: string;
}

function toForm(file: File): FormData {
  const form = new FormData();
  form.append('file', file);
  return form;
}

export const filesApi = {
  /** Uploads a product image; returns the products/-prefixed objectKey to store. */
  uploadProductImage: (file: File): Promise<FileUploadResponse> =>
    api.post<FileUploadResponse>('/api/v1/files/products', toForm(file)),

  /** Uploads a category image; returns the categories/-prefixed objectKey to store. */
  uploadCategoryImage: (file: File): Promise<FileUploadResponse> =>
    api.post<FileUploadResponse>('/api/v1/files/categories', toForm(file)),
};

/** Local mirror of the backend image allowlist (the server stays authoritative). */
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
