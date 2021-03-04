import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import fetch from 'node-fetch';
import * as fs from 'fs';

admin.initializeApp();

function formatDate(date: Date): string {
  var d = new Date(date),
      month = '' + (d.getMonth() + 1),
      day = '' + d.getDate(),
      year = d.getFullYear();

  if (month.length < 2) 
      month = '0' + month;
  if (day.length < 2) 
      day = '0' + day;

  return [year, month, day].join('-');
}

exports.tick = functions.pubsub.schedule('* * * * *').timeZone('America/New_York').onRun(async () => {
  const currencies: Record<number, string> = {
    825: "USDT"
  };

  const batch = admin.firestore().batch();

  for (const currencyId in Object.keys(currencies)) {
    const response = await fetch(`https://widgets.coinmarketcap.com/v2/ticker/${currencyId}/?ref=widget&convert=USD`);
    const data = await response.json();
  
    batch.update(admin.firestore().collection('currencies').doc(currencies[currencyId]).collection('latestData').doc(formatDate(new Date(data.data.last_updated))), {
      [data.data.last_updated]: {
        circulating_supply: data.data.circulating_supply,
        total_supply: data.data.total_supply,
        price: data.data.quotes.USD.price,
        volume_24h: data.data.quotes.USD.volume_24h,
        market_cap: data.data.quotes.USD.market_cap,
        percent_change_1h: data.data.quotes.USD.percent_change_1h,
        percent_change_24h: data.data.quotes.USD.percent_change_24h,
        percent_change_7d: data.data.quotes.USD.percent_change_7d,
      }
    });
  };

  return batch.commit();
});

const dateToString = (year: number, month: number, day: number): string =>
  `${year}-${month < 10 ? " "+month : month}-${day < 10 ? " "+day : day}`;

const getDaysInMonth = (month: number, year: number): number =>
 new Date(year, month, 0).getDate();

const getRefDates = (month: number, year: number) => {
  const daysCount: number = getDaysInMonth(month, year);
  let refs = [];
  for (let day=0; day<daysCount; day++)
    refs.push(admin.firestore().collection('latestData').doc(dateToString(year, month, day)))
  return refs;
}

const writeFilePromise = (file: string, data: string) => {
  return new Promise((resolve, reject) => {
      fs.writeFile(file, data, error => {
          if (error) reject(error);
          resolve("file created successfully with handcrafted Promise!");
      });
  });
};

exports.dump_data = functions.pubsub.schedule('10 0 1 * *').timeZone('America/New_York').onRun(async () => {
  const date: Date = new Date();

  return Promise.all(
    getRefDates(date.getFullYear(), date.getMonth() + 1).map(v => v.get())
  ).then(results => results.reduce((obj: Record<number, any>, dayData, i): Record<number, any> => {
    obj[i] = dayData;
    return obj;
  }, {})).then(data => {
    const filePath: string = `month_${date.getFullYear()}-${date.getMonth() + 1}.json`;
    return writeFilePromise(filePath, JSON.stringify(data)).then(() => {
      return admin.storage().bucket().upload(`./${filePath}`, {
        destination: `price_history_month/${filePath}`
      });
    });
  })
});

// await fetch(`https://production.api.coindesk.com/v1/currency/${currancy}/graph?start_date=${fromDate}&end_date=${toDate}&interval=1-mins&convert=USD&ohlc=false`);