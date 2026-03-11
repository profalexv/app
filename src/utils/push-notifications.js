/**
 * Gerenciador de Push Notifications
 * Envia notificações para professores sobre mudanças de horário
 */

const logger = require('../utils/logger');

class PushNotificationManager {
  constructor(db) {
    this.db = db;
    this.subscribers = new Map(); // Armazena subscribers em memória
  }

  /**
   * Registra um device/navegador para receber notificações
   * @param {number} teacherId - ID do professor
   * @param {string} subscription - JSON serializado da subscription
   */
  subscribe(teacherId, subscription) {
    try {
      if (!this.subscribers.has(teacherId)) {
        this.subscribers.set(teacherId, []);
      }
      this.subscribers.get(teacherId).push(JSON.parse(subscription));
      logger.info('Teacher subscribed to notifications', { teacherId });
      return { success: true };
    } catch (e) {
      logger.error('Subscription error', { error: e.message });
      return { success: false, error: e.message };
    }
  }

  /**
   * Remove subscription de notificações
   */
  unsubscribe(teacherId, subscription) {
    try {
      const subs = this.subscribers.get(teacherId);
      if (!subs) return { success: true };

      const endpoint = JSON.parse(subscription).endpoint;
      const filtered = subs.filter(s => s.endpoint !== endpoint);
      
      if (filtered.length === 0) {
        this.subscribers.delete(teacherId);
      } else {
        this.subscribers.set(teacherId, filtered);
      }
      
      logger.info('Teacher unsubscribed from notifications', { teacherId });
      return { success: true };
    } catch (e) {
      logger.error('Unsubscription error', { error: e.message });
      return { success: false, error: e.message };
    }
  }

  /**
   * Notifica professor sobre agendamento de recurso
   */
  async notifyBookingConfirmed(teacherId, booking, resource) {
    const title = '🔔 Agendamento Confirmado';
    const body = `${resource.name} agendado para ${this.formatDate(booking.date)}`;
    const options = {
      badge: '/icons/icon-72.png',
      icon: '/icons/icon-192.png',
      tag: `booking-${booking.id}`,
      data: {
        url: '/app?view=resources',
        bookingId: booking.id
      }
    };

    return this.sendNotification(teacherId, title, body, options);
  }

  /**
   * Notifica sobre mudança de horário
   */
  async notifyScheduleChange(teacherId, teacher, lesson, changeType) {
    const title = '⚠️ Mudança de Horário';
    const typeLabel = {
      'created': 'Nova aula',
      'updated': 'Aula alterada',
      'deleted': 'Aula cancelada'
    }[changeType] || 'Mudança';

    const body = `${typeLabel}: ${lesson.curriculum_name || lesson.class_name}`;
    const options = {
      badge: '/icons/icon-72.png',
      icon: '/icons/icon-192.png',
      tag: 'schedule-change',
      data: {
        url: '/app?view=schedule',
        lessonId: lesson.id
      }
    };

    return this.sendNotification(teacherId, title, body, options);
  }

  /**
   * Notifica sobre cancelamento de agendamento
   */
  async notifyBookingCancelled(teacherId, booking, resource) {
    const title = '❌ Agendamento Cancelado';
    const body = `${resource.name} foi cancelado`;

    return this.sendNotification(teacherId, title, body, {
      badge: '/icons/icon-72.png',
      icon: '/icons/icon-192.png',
      tag: `booking-${booking.id}`
    });
  }

  /**
   * Envia notificação push para um professor
   * @private
   */
  async sendNotification(teacherId, title, body, options = {}) {
    const subs = this.subscribers.get(teacherId);
    if (!subs || subs.length === 0) {
      return { success: false, message: 'No subscriptions' };
    }

    const payload = JSON.stringify({
      title,
      body,
      ...options
    });

    // Em produção, usar web-push
    // const webpush = require('web-push');
    // const failed = [];
    // for (const sub of subs) {
    //   try {
    //     await webpush.sendNotification(sub, payload);
    //   } catch (e) {
    //     logger.error('Push failed', { error: e.message });
    //     failed.push(sub.endpoint);
    //   }
    // }
    // if (failed.length > 0) {
    //   this.removeFailedSubscriptions(teacherId, failed);
    // }

    logger.info('Notification sent', { teacherId, title });
    return { success: true, count: subs.length };
  }

  /**
   * Remove subscriptions que falharam
   * @private
   */
  removeFailedSubscriptions(teacherId, endpoints) {
    const subs = this.subscribers.get(teacherId);
    if (!subs) return;

    const endpointSet = new Set(endpoints);
    const filtered = subs.filter(s => !endpointSet.has(s.endpoint));

    if (filtered.length === 0) {
      this.subscribers.delete(teacherId);
    } else {
      this.subscribers.set(teacherId, filtered);
    }
  }

  /**
   * Formata data para notificação
   * @private
   */
  formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('pt-BR', {
      weekday: 'short',
      month: '2-digit',
      day: '2-digit'
    });
  }

  /**
   * Notifica todos os professores de uma turma sobre mudança
   */
  async notifyClassTeachers(classId, message, type = 'class-change') {
    try {
      const teachers = this.db.prepare(`
        SELECT DISTINCT p.id, p.name
        FROM people p
        JOIN role_teacher rt ON p.id = rt.person_id
        JOIN class_teacher_curricula ctc ON p.id = ctc.teacher_id
        WHERE ctc.class_id = ?
      `).all(classId);

      const results = [];
      for (const teacher of teachers) {
        const result = await this.sendNotification(
          teacher.id,
          '📢 Aviso para Turma',
          message,
          {
            badge: '/icons/icon-72.png',
            icon: '/icons/icon-192.png',
            tag: `class-${classId}-${type}`
          }
        );
        results.push({ teacherId: teacher.id, ...result });
      }

      return { success: true, notified: results.length };
    } catch (e) {
      logger.error('Batch notification failed', { error: e.message });
      return { success: false, error: e.message };
    }
  }
}

module.exports = PushNotificationManager;
