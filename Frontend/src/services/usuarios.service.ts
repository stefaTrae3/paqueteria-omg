import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';

export interface UsuarioRow {
  id: number;
  nombre: string;
  email: string;
  rol: 'admin' | 'empleado' | 'cliente' | string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface UsuariosListResponse {
  data: UsuarioRow[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

@Injectable({ providedIn: 'root' })
export class UsuariosService {
  private baseUrl = 'http://localhost:3000/api';

  constructor(private http: HttpClient) {}

  list(options: {
    page?: number;
    limit?: number;
    search?: string;
    rol?: 'admin' | 'empleado' | 'cliente';
    estado?: 'activo' | 'inactivo' | 'todos';
    sortBy?: 'nombre' | 'email' | 'rol' | 'fecha_creacion';
    sortOrder?: 'asc' | 'desc';
  } = {}): Observable<UsuariosListResponse> {
    let params = new HttpParams();
    if (options.page) params = params.set('page', String(options.page));
    if (options.limit) params = params.set('limit', String(options.limit));
    if (options.search) params = params.set('search', options.search);
    if (options.rol) params = params.set('rol', options.rol);
    if (options.estado) params = params.set('estado', options.estado);
    if (options.sortBy) params = params.set('sortBy', options.sortBy);
    if (options.sortOrder) params = params.set('sortOrder', options.sortOrder);
    return this.http
      .get<{ success: boolean; data: UsuariosListResponse }>(`${this.baseUrl}/usuarios`, { params, withCredentials: true })
      .pipe(map(res => res.data));
  }

  activate(id: number): Observable<UsuarioRow> {
    return this.http
      .patch<{ success: boolean; data: UsuarioRow }>(`${this.baseUrl}/usuarios/${id}/activate`, {}, { withCredentials: true })
      .pipe(map(res => res.data));
  }

  deactivate(id: number): Observable<{ success?: boolean; message?: string }> {
    return this.http
      .patch<{ success?: boolean; data?: any; message?: string }>(`${this.baseUrl}/usuarios/${id}/deactivate`, {}, { withCredentials: true })
      .pipe(map(res => ({ success: (res as any).success ?? true, message: (res as any).message })));
  }

  delete(id: number): Observable<{ success?: boolean; message?: string }> {
    return this.http
      .delete<{ success?: boolean; data?: any; message?: string }>(`${this.baseUrl}/usuarios/${id}`, { withCredentials: true })
      .pipe(map(res => ({ success: (res as any).success ?? true, message: (res as any).message })));
  }
}