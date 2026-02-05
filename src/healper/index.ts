import axios from "axios";

export const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsImVtYWlsIjoicmFmaUBiYWtyaWVzdW1hdGVyYS5jb20iLCJ1c2VybmFtZSI6InJhZmkiLCJ2ZXJpZmllZCI6ZmFsc2UsInVzZXJUeXBlIjoiYWRtaW4iLCJhcmVhSWQiOm51bGwsImlhdCI6MTc2OTY4MjE5MCwiZXhwIjoxNzcwNTQ2MTkwLCJhdWQiOiJhZG1pbiIsImlzcyI6ImFic2VuLWR1bHUtYXBpIn0.Likkyn8cZHz_U8uUsA_4UyIwOvDd9UnvIvg5m6rtPt0'
export async function kirimData(body: any, path: string) {
  try {
    const response = await axios.post(
      `http://test-presensi.bakriesumatera.com:8081/${path}`,
        body,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // console.log(response.data);
  } catch (error) {
    console.error((error as any).response?.data || (error as any).message);
    throw error;
  }
}