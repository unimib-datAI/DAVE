import multiprocessing


def anonymize(s):
    words = s.split()
    new_words = ["".join([word[0]] + ["*" * (len(word) - 1)]) for word in words]
    return " ".join(new_words)
