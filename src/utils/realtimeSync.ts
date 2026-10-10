/**
 * Real-time synchronization utility for Wappa eSIM
 * Provides:
 * 1. Server-Sent Events (SSE) stream (/api/realtime/stream) for instant multi-device updates (< 100ms)
 * 2. BroadcastChannel for instant cross-tab synchronization
 * 3. Smart background auto-sync polling for pending orders and active tabs
 */

import { Order, User, UserEsim } from '../types';

type OrderApprovedCallback = (order: Order, esim: UserEsim) => void;
type OrderCreatedCallback = (order: Order) => void;
type OrderDeletedCallback = (data: any) => void;

class RealtimeSyncManager {
  private eventSource: EventSource | null = null;
  private broadcastChannel: BroadcastChannel | null = null;
  private currentEmail: string | null = null;
  private approvalCallbacks: Set<OrderApprovedCallback> = new Set();
  private createdCallbacks: Set<OrderCreatedCallback> = new Set();
  private deletedCallbacks: Set<OrderDeletedCallback> = new Set();

  constructor() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.broadcastChannel = new BroadcastChannel('wappa_orders_realtime_channel');
        this.broadcastChannel.onmessage = (event) => {
          const data = event.data;
          if (data?.type === 'order_approved' && data.order && data.esim) {
            this.notifyApproval(data.order, data.esim);
          } else if (data?.type === 'order_created' && data.order) {
            this.notifyCreated(data.order);
          } else if (data?.type === 'order_deleted') {
            this.notifyDeleted(data);
          }
        };
      } catch (e) {
        console.warn('BroadcastChannel not supported or error:', e);
      }
    }
  }

  public connect(userEmail?: string) {
    const cleanEmail = (userEmail || '').toLowerCase().trim();
    if (this.eventSource && this.currentEmail === cleanEmail) {
      return; // Already connected
    }

    this.disconnect();
    this.currentEmail = cleanEmail;

    if (typeof window === 'undefined' || !('EventSource' in window)) {
      return;
    }

    try {
      const url = `/api/realtime/stream?email=${encodeURIComponent(cleanEmail)}`;
      this.eventSource = new EventSource(url);

      this.eventSource.onmessage = (e) => {
        try {
          if (!e.data || e.data.startsWith(':')) return; // Heartbeat
          const data = JSON.parse(e.data);

          if (data.type === 'order_approved' && data.order && data.esim) {
            this.notifyApproval(data.order, data.esim);
          } else if (data.type === 'order_created' && data.order) {
            this.notifyCreated(data.order);
          } else if (data.type === 'order_deleted') {
            this.notifyDeleted(data);
          }
        } catch (err) {
          // JSON parse error or heartbeat
        }
      };

      this.eventSource.onerror = () => {
        // EventSource auto-reconnects automatically
      };
    } catch (err) {
      console.warn('Realtime EventSource connect error:', err);
    }
  }

  public disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.currentEmail = null;
  }

  public onOrderApproved(callback: OrderApprovedCallback): () => void {
    this.approvalCallbacks.add(callback);
    return () => this.approvalCallbacks.delete(callback);
  }

  public onOrderCreated(callback: OrderCreatedCallback): () => void {
    this.createdCallbacks.add(callback);
    return () => this.createdCallbacks.delete(callback);
  }

  public onOrderDeleted(callback: OrderDeletedCallback): () => void {
    this.deletedCallbacks.add(callback);
    return () => this.deletedCallbacks.delete(callback);
  }

  public broadcastLocalApproval(order: Order, esim: UserEsim) {
    this.notifyApproval(order, esim);
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({
          type: 'order_approved',
          order,
          esim,
        });
      } catch {}
    }
  }

  public broadcastLocalCreation(order: Order) {
    this.notifyCreated(order);
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({
          type: 'order_created',
          order,
        });
      } catch {}
    }
  }

  public broadcastLocalDelete(orderIdOrData: any) {
    const payload = typeof orderIdOrData === 'string' ? { orderId: orderIdOrData } : orderIdOrData;
    this.notifyDeleted(payload);
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({
          type: 'order_deleted',
          ...payload,
        });
      } catch {}
    }
  }

  private notifyApproval(order: Order, esim: UserEsim) {
    this.approvalCallbacks.forEach((cb) => {
      try {
        cb(order, esim);
      } catch (err) {
        console.warn('Error in order approved callback:', err);
      }
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('app:order_approved', {
          detail: { order, esim },
        })
      );
      window.dispatchEvent(new CustomEvent('app:order_approved_refresh'));
    }
  }

  private notifyDeleted(data: any) {
    this.deletedCallbacks.forEach((cb) => {
      try {
        cb(data);
      } catch (err) {
        console.warn('Error in order deleted callback:', err);
      }
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('app:order_deleted', {
          detail: typeof data === 'object' ? data : { orderId: data },
        })
      );
      window.dispatchEvent(new CustomEvent('app:order_approved_refresh'));
    }
  }

  private notifyCreated(order: Order) {
    this.createdCallbacks.forEach((cb) => {
      try {
        cb(order);
      } catch (err) {
        console.warn('Error in order created callback:', err);
      }
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('app:order_created', {
          detail: { order },
        })
      );
    }
  }
}

export const realtimeSync = new RealtimeSyncManager();
