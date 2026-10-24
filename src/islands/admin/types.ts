/** Re-exports of the admin contract, so views import from one place. */
export type {
  AdminRole,
  AuditRow,
  ConsentRow,
  DeliveryRow,
  NoteRow,
  RecordDetailData,
  RecordListItem,
  RecordType,
  RetentionData,
} from '../../shared/admin-api';
export type { RecordQuery } from './api';
