/** Permanent minimum reader once sole-domain recovery is activated. Writer
 * disablement and later rollbacks must retain this schema/reader capability. */
export const MORROVIA_OFFLINE_READER_FLOOR = "idb-recovery-v1";
