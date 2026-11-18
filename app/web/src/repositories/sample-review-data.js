// Loaded only for the admin example migration; keep source/archive contracts intact.
import legacy from '../domain/review/sample-reviews.json' with { type: 'json' };
import bundle from '../domain/review/linked-review-examples.json' with { type: 'json' };
import previous from '../domain/review/linked-review-examples-v2.json' with { type: 'json' };
import previousV3 from '../domain/review/linked-review-examples-v3.json' with { type: 'json' };
import previousV4 from '../domain/review/linked-review-examples-v4.json' with { type: 'json' };
import previousV5 from '../domain/review/linked-review-examples-v5.json' with { type: 'json' };
const archives = [...previous.examples, ...previousV3.examples, ...previousV4.examples, ...previousV5.examples];
export { legacy, bundle, previousV5, archives };
