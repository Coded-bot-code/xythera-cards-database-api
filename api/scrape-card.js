import axios from 'axios';
import cheerio from 'cheerio';

export default async function handler(req, res) {
  const { key, url } = req.query;
  if (key !== 'XYTHERA_API') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    const { data: html } = await axios.get(url, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Referer': 'https://shoob.gg/'
      }
    });

    const $ = cheerio.load(html);
    const data1 = $('.cardData').first();
    if (!data1.length) {
      return res.status(404).json({ error: 'Card data not found on page' });
    }

    let media = data1.find('video');
    let src = null;
    let title = null;

    if (media.length) {
      src = media.attr('src') || media.find('source').attr('src');
      title = media.attr('title') || media.attr('alt');
    } else {
      media = data1.find('img');
      src = media.attr('src') || media.attr('data-src');
      title = media.attr('title') || media.attr('alt');
    }

    if (!src) {
      return res.status(404).json({ error: 'Card media URL not found' });
    }

    const pathParts = src.split('/');
    const tier = pathParts[5] || 'Unknown';
    const cardId = pathParts[6]?.split('.')[0] || 'Unknown';
    let description = $('head meta[name="description"]').attr('content') || '';
    description = description ? description.split('Creators:')[0].trim() : 'No description available';

    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers.host;
    const proxyImage = cardId !== 'Unknown'
      ? `${proto}://${host}/api/image?id=${encodeURIComponent(cardId)}&animated=true&size=original`
      : null;

    return res.status(200).json({
      name: title || 'Unknown',
      image: src,
      description,
      tier,
      url,
      id: cardId,
      proxy_image: proxyImage
    });
  } catch (error) {
    return res.status(500).json({ error: `Failed to fetch card data: ${error.message}` });
  }
}
