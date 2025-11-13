import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UsuariosService, UsuarioRow, UsuariosListResponse } from '../../services/usuarios.service';

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-users.component.html',
  styleUrls: ['./admin-users.component.css']
})
export class AdminUsersComponent implements OnInit {
  // Filtros
  search = '';
  rol: '' | 'admin' | 'empleado' | 'cliente' = '';
  estado: 'activo' | 'inactivo' | 'todos' = 'inactivo';
  sortBy: 'nombre' | 'email' | 'rol' | 'fecha_creacion' = 'fecha_creacion';
  sortOrder: 'asc' | 'desc' = 'desc';

  // Paginación
  page = 1;
  limit = 10;

  // Estado UI
  loading = false;
  error = '';
  rows: UsuarioRow[] = [];
  total = 0;
  totalPages = 0;

  constructor(private usuarios: UsuariosService) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.usuarios.list({
      page: this.page,
      limit: this.limit,
      search: this.search || undefined,
      rol: this.rol || undefined,
      estado: this.estado,
      sortBy: this.sortBy,
      sortOrder: this.sortOrder
    }).subscribe({
      next: (res: UsuariosListResponse) => {
        this.rows = res.data.map(r => ({
          ...r,
          // normalizar nombres de campos si vienen como name/role
          nombre: (r as any).nombre || (r as any).name || r.nombre,
          rol: (r as any).rol || (r as any).role || r.rol
        }));
        this.total = res.pagination.total;
        this.totalPages = res.pagination.totalPages;
        this.loading = false;
      },
      error: (err) => {
        this.error = err?.error?.message || 'Error al cargar usuarios';
        this.loading = false;
      }
    });
  }

  onSearchChange(): void {
    this.page = 1;
    this.load();
  }

  changePage(delta: number): void {
    const next = this.page + delta;
    if (next < 1 || (this.totalPages && next > this.totalPages)) return;
    this.page = next;
    this.load();
  }

  activate = (u: UsuarioRow): void => {
    if (!confirm(`¿Activar la cuenta de ${u.nombre}?`)) return;
    this.usuarios.activate(u.id).subscribe({
      next: () => this.load(),
      error: (err) => {
        this.error = err?.error?.message || 'No se pudo activar';
      }
    });
  }

  deactivate = (u: UsuarioRow): void => {
    if (!confirm(`¿Desactivar la cuenta de ${u.nombre}?`)) return;
    this.usuarios.deactivate(u.id).subscribe({
      next: () => this.load(),
      error: (err) => {
        this.error = err?.error?.message || 'No se pudo desactivar';
      }
    });
  }

  delete = (u: UsuarioRow): void => {
    if (!confirm(`¿Desactivar la cuenta de ${u.nombre}?`)) return;
    this.usuarios.delete(u.id).subscribe({
      next: () => this.load(),
      error: (err) => {
        this.error = err?.error?.message || 'No se pudo desactivar';
      }
    });
  }
}