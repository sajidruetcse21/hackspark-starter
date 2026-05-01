export default function Api(req, res) {
  res.status(200).json({ status: 'ok', service: 'frontend' });
}
