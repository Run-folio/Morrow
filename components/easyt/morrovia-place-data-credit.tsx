import styles from './morrovia-place-data-credit.module.css';
export function MorroviaPlaceDataCredit({sources,language='en'}:{sources:readonly ('geonames'|'ourairports'|'openstreetmap')[];language?:'en'|'es'}){
 if(!sources.length)return null;
 return <p className={styles.credit}>{language==='es'?'Datos de lugares: ':'Place data: '}
  {sources.includes('geonames')?<><a href="https://www.geonames.org/" target="_blank" rel="noreferrer">GeoNames</a> (<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>, {language==='es'?'filtrados y adaptados':'filtered and adapted'})</>:null}
  {sources.includes('ourairports')?<>{sources.includes('geonames')?' · ':''}<a href="https://ourairports.com/data/" target="_blank" rel="noreferrer">OurAirports</a> ({language==='es'?'dominio público':'public domain'})</>:null}
  {sources.includes('openstreetmap')?<>{sources.some(s=>s!=='openstreetmap')?' · ':''}<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap {language==='es'?'colaboradores':'contributors'}</a></>:null}
 </p>;
}
