import EasyTNavigation from "../easyt-navigation";
import GuestDeviceTrips from "../login/guest-device-trips";
import styles from "../account.module.css";

export default function GuestTrips({ accountAvailable }: { accountAvailable: boolean }) {
  return <main className={styles.page}>
    <EasyTNavigation current="trips" />
    <section className={styles.guestDashboard} aria-labelledby="guest-trips-title">
      <h1 id="guest-trips-title">My Trips</h1>
      <GuestDeviceTrips presentation="dashboard" accountAvailable={accountAvailable} />
    </section>
  </main>;
}
