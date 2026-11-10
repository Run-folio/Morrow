import EasyTNavigation from '../easyt-navigation';
import TripTodayWorkspace from '@/components/easyt/trip-today-workspace';
export const metadata={title:'Today'};
export default function TodayWithoutTrip(){return <main className="morrovia-editorial-page"><EasyTNavigation current="trips"/><TripTodayWorkspace trip={null}/></main>;}
