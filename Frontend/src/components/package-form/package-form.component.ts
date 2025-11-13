import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { PackageService } from '../../services/package.service';
import { Package, PackageStatus, CreatePackageRequest } from '../../models/package.model';

@Component({
  selector: 'app-package-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: "package-form.component.html",
  styleUrls: ["package-form.component.css"]
})
export class PackageFormComponent implements OnInit {
  isEditMode = false;
  isSubmitting = false;
  packageId: string | null = null;
  tomorrow: string;
  estimatedDeliveryError: string | null = null;
  backendErrors: Record<string, string | null> = {};
  serverErrorMessage: string | null = null;
  serverErrorDetails: { path: string; label: string; msg: string }[] = [];

  formData = {
    sender_name: '',
    sender_email: '',
    sender_phone: '',
    sender_address: '',
    recipient_name: '',
    recipient_email: '',
    recipient_phone: '',
    recipient_address: '',
    weight: 0,
    dimensions: '',
    description: '',
    quantity: 1,
    estimated_delivery: '',
    notes: '',
    status: PackageStatus.PENDING
  };

  constructor(
    private packageService: PackageService,
    private router: Router,
    private route: ActivatedRoute
  ) {
    // Set tomorrow as minimum delivery date
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    this.tomorrow = tomorrow.toISOString().split('T')[0];
    this.formData.estimated_delivery = this.tomorrow;
  }

  ngOnInit() {
    this.packageId = this.route.snapshot.paramMap.get('id');
    this.isEditMode = !!this.packageId;

    if (this.isEditMode && this.packageId) {
      this.loadPackage(this.packageId);
    }
  }

  loadPackage(id: string) {
    this.packageService.getPackageById(id).subscribe(package_ => {
      if (package_) {
        console.log('Paquete cargado para editar:', package_);
        // Convertir las fechas ISO a formato local para el input date
        let estimatedDeliveryDate = this.tomorrow;
        
        // Buscar la fecha estimada en diferentes campos del backend
        const estimatedDate = package_.estimated_delivery || 
                             (package_ as any).estimated_delivery_date || 
                             (package_ as any).eta;
        
        if (estimatedDate) {
          try {
            // Crear un objeto Date y ajustar por la zona horaria local
            const date = new Date(estimatedDate);
            // Obtener la fecha en formato YYYY-MM-DD para el input date
            estimatedDeliveryDate = date.getFullYear() + '-' + 
              String(date.getMonth() + 1).padStart(2, '0') + '-' + 
              String(date.getDate() + 1).padStart(2, '0');
          } catch (error) {
            console.error('Error al convertir fecha estimada:', error);
            estimatedDeliveryDate = this.tomorrow;
          }
        }

        this.formData = {
          sender_name: package_.sender_name || '',
          sender_email: package_.sender_email || '',
          sender_phone: package_.sender_phone || '',
          sender_address: package_.sender_address || '',
          recipient_name: package_.recipient_name || '',
          recipient_email: package_.recipient_email || '',
          recipient_phone: package_.recipient_phone || '',
          recipient_address: package_.recipient_address || '',
          weight: package_.weight || 0,
          dimensions: package_.dimensions || '',
          description: package_.description || '',
          quantity: package_.quantity || 1,
          estimated_delivery: estimatedDeliveryDate,
          notes: package_.notes || '',
          status: package_.status || PackageStatus.PENDING
        };
        console.log('Formulario inicializado con:', this.formData);
        console.log('Fecha estimada original (estimated_delivery):', package_.estimated_delivery);
        console.log('Fecha estimada original (estimated_delivery_date):', (package_ as any).estimated_delivery_date);
        console.log('Fecha estimada original (eta):', (package_ as any).eta);
        console.log('Fecha estimada encontrada:', estimatedDate);
        console.log('Fecha estimada convertida:', estimatedDeliveryDate);
      }
    });
  }

  onSubmit(form: NgForm) {
    if (this.isSubmitting) return;
    this.validateEstimatedDelivery();
    if (!this.isFormValid(form)) {
      Object.values(form.controls).forEach(c => (c as any).markAsTouched?.());
      return;
    }
    this.isSubmitting = true;

    const packageData = {
      sender_name: this.formData.sender_name,
      sender_email: this.formData.sender_email,
      sender_phone: this.formData.sender_phone,
      sender_address: this.formData.sender_address,
      recipient_name: this.formData.recipient_name,
      recipient_email: this.formData.recipient_email,
      recipient_phone: this.formData.recipient_phone,
      recipient_address: this.formData.recipient_address,
      weight: this.formData.weight,
      dimensions: this.formData.dimensions,
      description: this.formData.description,
      quantity: this.formData.quantity,
      estimated_delivery: new Date(this.formData.estimated_delivery).toISOString(),
      // notes: this.formData.notes, // Comentado temporalmente
      status: this.formData.status
    };
    
    // Asegurarse de que los campos quantity, estimated_delivery y notes se incluyan en la actualización
    console.log('Enviando datos de paquete:', packageData);

    if (this.isEditMode && this.packageId) {
      // Asegurarse de que los campos quantity, estimated_delivery estén explícitamente incluidos
      const updateData = {
        ...packageData,
        quantity: this.formData.quantity,
        estimated_delivery: new Date(this.formData.estimated_delivery).toISOString(),
        // notes: this.formData.notes // Comentado temporalmente
      };
      
      console.log('Datos de actualización:', updateData);
      
      this.packageService.updatePackage(this.packageId, updateData).subscribe({
        next: (updatedPackage) => {
          console.log('Paquete actualizado:', updatedPackage);
          this.router.navigate(['/paquetes']);
        },
        error: (error) => {
          console.error('Error al actualizar el paquete:', error);
          this.applyBackendErrors(error, form);
          this.isSubmitting = false;
        },
        complete: () => {
          this.isSubmitting = false;
        }
      });
    } else {
      const { status, ...createData } = packageData;
      this.packageService.createPackage(createData as CreatePackageRequest).subscribe({
        next: () => {
          this.router.navigate(['/paquetes']);
        },
        error: (error) => {
          console.error('Error al crear el paquete:', error);
          this.applyBackendErrors(error, form);
          this.isSubmitting = false;
        },
        complete: () => {
          this.isSubmitting = false;
        }
      });
    }
  }

  goBack() {
    this.router.navigate(['/paquetes']);
  }

  isFormValid(form: NgForm): boolean {
    const backendHasErrors = Object.values(this.backendErrors).some(v => !!v);
    return form.form.valid && this.formData.weight > 0 && !this.estimatedDeliveryError && !backendHasErrors;
  }

  onEstimatedDeliveryChange(value: string) {
    this.formData.estimated_delivery = value;
    this.validateEstimatedDelivery();
  }

  validateEstimatedDelivery() {
    const value = this.formData.estimated_delivery;
    if (!value) {
      this.estimatedDeliveryError = 'Este campo es obligatorio';
      return;
    }
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      this.estimatedDeliveryError = 'Formato de fecha incorrecto';
      return;
    }
    const tomorrowDate = new Date(this.tomorrow);
    if (date < tomorrowDate) {
      this.estimatedDeliveryError = 'La fecha debe ser posterior a mañana';
      return;
    }
    this.estimatedDeliveryError = null;
  }

  clearBackendError(field: string) {
    if (this.backendErrors[field]) {
      this.backendErrors[field] = null;
    }
    if (this.serverErrorMessage) {
      this.serverErrorMessage = null;
    }
    if (this.serverErrorDetails.length) {
      this.serverErrorDetails = this.serverErrorDetails.filter(d => d.path !== field);
      if (this.serverErrorDetails.length === 0) {
        this.serverErrorMessage = null;
      }
    }
  }

  private applyBackendErrors(error: any, form: NgForm) {
    try {
      const details = error?.error?.details || error?.details;
      this.serverErrorDetails = [];
      if (Array.isArray(details)) {
        details.forEach((d: any) => {
          const path: string = d?.path;
          const msg: string = d?.msg || 'Dato inválido';
          if (path) {
            this.backendErrors[path] = msg;
            const ctrlName = this.mapBackendPathToControlName(path);
            if (ctrlName && form.controls[ctrlName]) {
              (form.controls[ctrlName] as any).markAsTouched?.();
            }
            this.serverErrorDetails.push({ path, label: this.mapBackendPathToLabel(path), msg });
          }
        });
        this.serverErrorMessage = error?.error?.error || 'Datos de entrada inválidos';
        if (this.serverErrorMessage) {
          alert(this.serverErrorMessage);
        }
      }
      else {
        this.serverErrorMessage = error?.error?.error || error?.message || 'Error del servidor. Inténtalo nuevamente.';
        alert(this.serverErrorMessage);
      }
    } catch (e) {
      console.error('No se pudieron aplicar errores del backend', e);
      this.serverErrorMessage = 'Ocurrió un error inesperado. Intenta nuevamente.';
      alert(this.serverErrorMessage);
    }
  }

  private mapBackendPathToLabel(path: string): string {
    const labels: Record<string, string> = {
      sender_email: 'Correo del remitente',
      recipient_email: 'Correo del destinatario',
      sender_name: 'Nombre del remitente',
      recipient_name: 'Nombre del destinatario',
      sender_phone: 'Teléfono del remitente',
      recipient_phone: 'Teléfono del destinatario',
      sender_address: 'Dirección del remitente',
      recipient_address: 'Dirección del destinatario',
      weight: 'Peso',
      quantity: 'Cantidad de productos',
      dimensions: 'Dimensiones',
      description: 'Descripción',
      estimated_delivery: 'Fecha de entrega estimada',
    };
    return labels[path] || path;
  }

  private mapBackendPathToControlName(path: string): string | null {
    const map: Record<string, string> = {
      sender_email: 'senderEmail',
      recipient_email: 'recipientEmail',
      sender_name: 'senderName',
      recipient_name: 'recipientName',
      sender_phone: 'senderPhone',
      recipient_phone: 'recipientPhone',
      sender_address: 'senderAddress',
      recipient_address: 'recipientAddress',
      weight: 'weight',
      quantity: 'quantity',
      dimensions: 'dimensions',
      description: 'description',
      estimated_delivery: 'estimatedDelivery',
    };
    return map[path] || null;
  }
}
